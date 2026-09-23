package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestUpdatePersonInvalidInput(t *testing.T) {
	tests := []struct{ name, id, body string }{
		{"non-numeric ID", "abc", `{"weeklyHours":32}`},
		{"zero ID", "0", `{"weeklyHours":32}`},
		{"negative ID", "-1", `{"weeklyHours":32}`},
		{"fractional ID", "4.5", `{"weeklyHours":32}`},
		{"ID exceeds database integer", "2147483648", `{"weeklyHours":32}`},
		{"empty body", "4", ""},
		{"malformed JSON", "4", `{"weeklyHours":`},
		{"missing capacity", "4", `{}`},
		{"null body", "4", `null`},
		{"null capacity", "4", `{"weeklyHours":null}`},
		{"string capacity", "4", `{"weeklyHours":"32"}`},
		{"boolean capacity", "4", `{"weeklyHours":true}`},
		{"array body", "4", `[32]`},
		{"number body", "4", `32`},
		{"unknown field", "4", `{"weeklyHours":32,"name":"Changed"}`},
		{"negative capacity", "4", `{"weeklyHours":-0.5}`},
		{"capacity above maximum", "4", `{"weeklyHours":120.1}`},
		{"overflow", "4", `{"weeklyHours":1e999}`},
		{"non-finite number", "4", `{"weeklyHours":NaN}`},
		{"multiple JSON objects", "4", `{"weeklyHours":32}{"weeklyHours":0}`},
		{"oversized body", "4", `{"weeklyHours":32}` + strings.Repeat(" ", 1024)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Validation must finish before accessing a database.
			w := patchTestPerson(context.Background(), &server{}, tt.id, tt.body)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400: %s", w.Code, w.Body)
			}
			var body map[string]string
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body["error"] == "" {
				t.Fatalf("expected a JSON error, got %s", w.Body)
			}
			if w.Header().Get("Content-Type") != "application/json" {
				t.Fatal("error response is not application/json")
			}
		})
	}
}

func TestUpdatePersonDatabaseFailure(t *testing.T) {
	db, err := pgxpool.New(context.Background(), "postgres://localhost/capacity?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	w := patchTestPerson(context.Background(), &server{db: db}, "4", `{"weeklyHours":32}`)
	if w.Code != http.StatusInternalServerError ||
		strings.TrimSpace(w.Body.String()) != `{"error":"Unable to update weekly capacity."}` {
		t.Fatalf("expected generic JSON 500, got %d: %s", w.Code, w.Body)
	}
}

func TestUpdatePersonAndRefetch(t *testing.T) {
	dsn := os.Getenv("CAPACITY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set CAPACITY_TEST_DATABASE_URL to run against the seeded assignment database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	// Each connection gets its own temporary people table. Handlers execute real
	// SQL against copied seed data while public.people and assignments stay intact.
	config.MaxConns = 1
	config.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, `
			CREATE TEMP TABLE people (LIKE public.people INCLUDING ALL);
			INSERT INTO people SELECT * FROM public.people;
		`)
		return err
	}
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := &server{db: db}
	before := loadTestCapacity(t, ctx, s, "2025-12-29", "2026-01-16")
	assertCompleteSeededGrid(t, before)

	for _, tt := range []struct {
		name                  string
		weekly, partialWeekly float64
	}{
		{"zero", 0, 0},
		{"fractional", 32.5, 19.5},
		{"decimal", 0.1, 0.06},
		{"maximum", 120, 72},
	} {
		t.Run(tt.name, func(t *testing.T) {
			body := `{"weeklyHours":` + strconv.FormatFloat(tt.weekly, 'f', -1, 64) + `}`
			w := patchTestPerson(ctx, s, "4", body)
			if w.Code != http.StatusOK {
				t.Fatalf("PATCH returned %d: %s", w.Code, w.Body)
			}
			var saved personResponse
			if err := json.Unmarshal(w.Body.Bytes(), &saved); err != nil {
				t.Fatal(err)
			}
			if saved.ID != 4 || saved.Name != "Dee Okafor" || saved.WeeklyHours != tt.weekly {
				t.Fatalf("incorrect saved person: %+v", saved)
			}

			after := loadTestCapacity(t, ctx, s, "2025-12-29", "2026-01-16")
			assertCompleteSeededGrid(t, after)
			for i, person := range after.People {
				if person.ID != 4 {
					if !reflect.DeepEqual(person, before.People[i]) {
						t.Errorf("editing Dee changed person %d", person.ID)
					}
					continue
				}
				if person.WeeklyHours != tt.weekly {
					t.Errorf("refetched weekly hours = %v, want %v", person.WeeklyHours, tt.weekly)
				}
				for j, cell := range person.Weeks {
					if cell.CapacityHours != tt.weekly || cell.AllocatedHours != before.People[i].Weeks[j].AllocatedHours {
						t.Errorf("incorrect cell after edit: %+v", cell)
					}
				}
			}
			partial := loadTestCapacity(t, ctx, s, "2026-01-06", "2026-01-08")
			cell := partial.People[3].Weeks[0]
			if cell.AllocatedHours != 28 || math.Abs(cell.CapacityHours-tt.partialWeekly) > 1e-9 {
				t.Errorf("incorrect partial week after edit: %+v", cell)
			}
		})
	}

	t.Run("unknown person", func(t *testing.T) {
		w := patchTestPerson(ctx, s, "2147483647", `{"weeklyHours":32}`)
		if w.Code != http.StatusNotFound || strings.TrimSpace(w.Body.String()) != `{"error":"Person not found."}` {
			t.Fatalf("expected JSON 404, got %d: %s", w.Code, w.Body)
		}
	})
	t.Run("invalid edit leaves saved capacity unchanged", func(t *testing.T) {
		before := loadTestCapacity(t, ctx, s, "2026-01-06", "2026-01-08")
		w := patchTestPerson(ctx, s, "4", `{"weeklyHours":-1}`)
		if w.Code != http.StatusBadRequest {
			t.Fatalf("status = %d, want 400", w.Code)
		}
		after := loadTestCapacity(t, ctx, s, "2026-01-06", "2026-01-08")
		if !reflect.DeepEqual(before, after) {
			t.Fatal("invalid edit changed capacity results")
		}
	})

	var originalHours float64
	if err := db.QueryRow(ctx, `SELECT weekly_hours::double precision FROM public.people WHERE id = 4`).Scan(&originalHours); err != nil {
		t.Fatal(err)
	}
	if originalHours != before.People[3].WeeklyHours {
		t.Fatal("the original seed row was modified")
	}
}

func patchTestPerson(ctx context.Context, s *server, id, body string) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	mux.HandleFunc("PATCH /api/people/{id}", s.handleUpdatePerson)
	r := httptest.NewRequest(http.MethodPatch, "/api/people/"+id, strings.NewReader(body)).WithContext(ctx)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	return w
}
