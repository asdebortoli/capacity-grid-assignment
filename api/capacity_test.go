package main

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestHandleCapacityInvalidRange(t *testing.T) {
	tests := []struct{ name, from, to string }{
		{"missing dates", "", ""},
		{"missing from", "", "2026-01-05"},
		{"missing to", "2026-01-05", ""},
		{"invalid calendar date", "2026-02-29", "2026-03-01"},
		{"invalid end date", "2026-01-01", "2026-04-31"},
		{"non-padded date", "2026-1-05", "2026-01-09"},
		{"timestamp", "2026-01-05T00:00:00Z", "2026-01-09"},
		{"year zero", "0000-01-01", "0000-01-02"},
		{"reversed range", "2026-01-09", "2026-01-05"},
		{"367 days", "2026-01-01", "2027-01-02"},
		{"very large range", "0001-01-01", "9999-12-31"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// No database is available: invalid requests must stop before querying it.
			s := &server{}
			r := httptest.NewRequest(http.MethodGet, capacityURL(tt.from, tt.to), nil)
			w := httptest.NewRecorder()
			s.handleCapacity(w, r)
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

func TestParseCapacityRangeAccepted(t *testing.T) {
	for _, dates := range [][2]string{
		{"2026-01-05", "2026-01-05"}, // Single day.
		{"2026-01-10", "2026-01-11"}, // Weekend only.
		{"2024-02-29", "2024-03-01"}, // Leap day.
		{"2026-01-04", "2027-01-04"}, // Exactly 366 inclusive days.
		{"0001-01-01", "0001-01-01"},
		{"9999-12-31", "9999-12-31"},
	} {
		t.Run(dates[0]+"_"+dates[1], func(t *testing.T) {
			from, to, err := parseCapacityRange(dates[0], dates[1])
			if err != nil {
				t.Fatal(err)
			}
			if from.Format(dateLayout) != dates[0] || to.Format(dateLayout) != dates[1] ||
				from.Location() != time.UTC || to.Location() != time.UTC {
				t.Fatalf("unexpected parsed dates: %v, %v", from, to)
			}
		})
	}
}

func TestHandleCapacityDatabaseFailure(t *testing.T) {
	// A closed pool fails deterministically without opening a database connection.
	db, err := pgxpool.New(context.Background(), "postgres://localhost/capacity?sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	w := httptest.NewRecorder()
	(&server{db: db}).handleCapacity(w,
		httptest.NewRequest(http.MethodGet, capacityURL("2026-01-05", "2026-01-09"), nil))
	if w.Code != http.StatusInternalServerError ||
		strings.TrimSpace(w.Body.String()) != `{"error":"Unable to load capacity."}` {
		t.Fatalf("expected generic JSON 500, got %d: %s", w.Code, w.Body)
	}
}

// These read-only integration tests use the assignment's unchanged seed.
// In Compose: sh -c 'CAPACITY_TEST_DATABASE_URL="$DATABASE_URL" go test -v ./...'
func TestCapacitySeededData(t *testing.T) {
	dsn := os.Getenv("CAPACITY_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set CAPACITY_TEST_DATABASE_URL to run against the seeded assignment database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	s := &server{db: db}
	tests := []struct {
		name, from, to string
		weeks          []capacityWeek
		// Expected allocation for people 1-5, calculated independently by hand.
		allocated [][]float64
		allZero   bool
	}{
		{
			name: "starter range with overlap and year boundary", from: "2025-12-29", to: "2026-01-16",
			weeks: []capacityWeek{
				{"2025-12-29", "2025-12-29", "2026-01-04", 5},
				{"2026-01-05", "2026-01-05", "2026-01-11", 5},
				{"2026-01-12", "2026-01-12", "2026-01-16", 5},
			},
			allocated: [][]float64{{40, 0, 30}, {0, 32, 8}, {0, 4, 12}, {0, 45, 40}, {0, 20, 0}},
		},
		{
			name: "partial week", from: "2026-01-06", to: "2026-01-08",
			weeks:     []capacityWeek{{"2026-01-05", "2026-01-06", "2026-01-08", 3}},
			allocated: [][]float64{{0}, {16}, {0}, {28}, {12}},
		},
		{
			name: "single day includes both assignment endpoints", from: "2026-01-05", to: "2026-01-05",
			weeks:     []capacityWeek{{"2026-01-05", "2026-01-05", "2026-01-05", 1}},
			allocated: [][]float64{{0}, {8}, {4}, {6}, {4}},
		},
		{
			name: "Friday through Monday", from: "2026-01-09", to: "2026-01-12",
			weeks: []capacityWeek{
				{"2026-01-05", "2026-01-09", "2026-01-11", 1},
				{"2026-01-12", "2026-01-12", "2026-01-12", 1},
			},
			allocated: [][]float64{{0, 6}, {8, 8}, {0, 4}, {11, 8}, {4, 0}},
		},
		{
			name: "weekend only", from: "2026-01-10", to: "2026-01-11",
			weeks: []capacityWeek{{"2026-01-05", "2026-01-10", "2026-01-11", 0}}, allZero: true,
		},
		{
			name: "no assignments in range", from: "2027-02-01", to: "2027-02-07",
			weeks: []capacityWeek{{"2027-02-01", "2027-02-01", "2027-02-07", 5}}, allZero: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := loadTestCapacity(t, ctx, s, tt.from, tt.to)
			if !reflect.DeepEqual(got.Weeks, tt.weeks) {
				t.Fatalf("weeks = %+v, want %+v", got.Weeks, tt.weeks)
			}
			assertCompleteSeededGrid(t, got)
			for _, person := range got.People {
				for i, cell := range person.Weeks {
					if tt.allZero && cell.AllocatedHours != 0 {
						t.Errorf("person %d week %s: expected zero allocation", person.ID, cell.WeekStart)
					}
					if person.ID <= 5 && tt.allocated != nil {
						want := tt.allocated[person.ID-1][i]
						if math.Abs(cell.AllocatedHours-want) > 1e-9 {
							t.Errorf("person %d week %s: allocated = %v, want %v", person.ID, cell.WeekStart, cell.AllocatedHours, want)
						}
					}
				}
			}
			if tt.name == "partial week" && got.People[3].Weeks[0].CapacityHours != 24 {
				t.Fatal("Dee's three-day capacity must be 24 hours")
			}
		})
	}
	t.Run("maximum range", func(t *testing.T) {
		got := loadTestCapacity(t, ctx, s, "2026-01-04", "2027-01-04")
		if len(got.Weeks) != 54 {
			t.Fatalf("week count = %d, want 54", len(got.Weeks))
		}
		assertCompleteSeededGrid(t, got)
	})
}

func assertCompleteSeededGrid(t *testing.T, got capacityResponse) {
	t.Helper()
	if len(got.People) != 500 {
		t.Fatalf("people count = %d, want 500", len(got.People))
	}
	for i, person := range got.People {
		if person.ID != i+1 || len(person.Weeks) != len(got.Weeks) {
			t.Fatalf("missing, duplicate, or unordered person/week: %+v", person)
		}
		for j, cell := range person.Weeks {
			if cell.WeekStart != got.Weeks[j].WeekStart {
				t.Fatalf("person %d has an incorrect week key", person.ID)
			}
			wantCapacity := person.WeeklyHours / 5 * float64(got.Weeks[j].WorkingDays)
			if math.Abs(cell.CapacityHours-wantCapacity) > 1e-9 {
				t.Errorf("person %d week %s: capacity = %v, want %v", person.ID, cell.WeekStart, cell.CapacityHours, wantCapacity)
			}
		}
	}
	if got.People[4].WeeklyHours != 0 {
		t.Fatal("Eli's zero weekly capacity must be preserved")
	}
}

func loadTestCapacity(t *testing.T, ctx context.Context, s *server, from, to string) capacityResponse {
	t.Helper()
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, capacityURL(from, to), nil).WithContext(ctx)
	s.handleCapacity(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("GET capacity returned %d: %s", w.Code, w.Body)
	}
	var result capacityResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func capacityURL(from, to string) string {
	return "/api/capacity?" + url.Values{"from": {from}, "to": {to}}.Encode()
}
