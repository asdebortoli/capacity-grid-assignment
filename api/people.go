package main

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"

	"github.com/jackc/pgx/v5"
)

type personResponse struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	WeeklyHours float64 `json:"weeklyHours"`
}

func (s *server) handleUpdatePerson(w http.ResponseWriter, r *http.Request) {
	// PostgreSQL serial IDs are signed 32-bit integers.
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 32)
	if err != nil || id <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Person ID must be a positive 32-bit integer."})
		return
	}

	var input struct {
		// A pointer distinguishes an explicit zero from a missing or null value.
		WeeklyHours *float64 `json:"weeklyHours"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Body must be a JSON object containing only a numeric weeklyHours field (maximum 1 KB)."})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Body must contain a single JSON object (maximum 1 KB)."})
		return
	}
	if input.WeeklyHours == nil || math.IsNaN(*input.WeeklyHours) || math.IsInf(*input.WeeklyHours, 0) ||
		*input.WeeklyHours < 0 || *input.WeeklyHours > 120 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "weeklyHours must be a number between 0 and 120, inclusive."})
		return
	}

	var person personResponse
	err = s.db.QueryRow(r.Context(), `
		UPDATE people SET weekly_hours = $2
		WHERE id = $1
		RETURNING id, name, weekly_hours::double precision
	`, int32(id), *input.WeeklyHours).Scan(&person.ID, &person.Name, &person.WeeklyHours)
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Person not found."})
		return
	}
	if err != nil {
		log.Printf("update person: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to update weekly capacity."})
		return
	}
	writeJSON(w, http.StatusOK, person)
}
