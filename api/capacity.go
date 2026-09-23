package main

import (
	"errors"
	"log"
	"net/http"
	"time"
)

const dateLayout = "2006-01-02"
const maxRangeDays = 366

type capacityResponse struct {
	Weeks  []capacityWeek   `json:"weeks"`
	People []personCapacity `json:"people"`
}

type capacityWeek struct {
	WeekStart   string `json:"weekStart"`
	From        string `json:"from"`
	To          string `json:"to"`
	WorkingDays int    `json:"workingDays"`
}

type personCapacity struct {
	ID          int            `json:"id"`
	Name        string         `json:"name"`
	WeeklyHours float64        `json:"weeklyHours"`
	Weeks       []weekCapacity `json:"weeks"`
}

type weekCapacity struct {
	WeekStart      string  `json:"weekStart"`
	AllocatedHours float64 `json:"allocatedHours"`
	CapacityHours  float64 `json:"capacityHours"`
}

// Calendar dates are timezone-free. Generate only the bounded requested range;
// sum each assignment row on its inclusive weekdays using PostgreSQL numeric
// arithmetic, then join the totals to every person/week (including empty ones).
const capacityQuery = `
WITH days AS (
    SELECT day::date AS day,
           date_trunc('week', day)::date AS week_start,
           extract(isodow FROM day) <= 5 AS is_workday
    FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') AS dates(day)
), weeks AS (
    SELECT week_start, min(day) AS from_date, max(day) AS to_date,
           count(*) FILTER (WHERE is_workday)::int AS working_days
    FROM days
    GROUP BY week_start
), allocated AS (
    SELECT a.person_id, d.week_start, sum(a.hours_per_day) AS allocated_hours
    FROM days d
    JOIN assignments a ON d.day BETWEEN a.start_date AND a.end_date
    WHERE d.is_workday
      AND a.start_date <= $2::date
      AND a.end_date >= $1::date
    GROUP BY a.person_id, d.week_start
)
SELECT to_char(w.week_start, 'YYYY-MM-DD'),
       to_char(w.from_date, 'YYYY-MM-DD'),
       to_char(w.to_date, 'YYYY-MM-DD'),
       w.working_days,
       p.id, p.name, p.weekly_hours::double precision,
       coalesce(a.allocated_hours, 0)::double precision,
       coalesce(p.weekly_hours * w.working_days / 5, 0)::double precision
FROM weeks w
LEFT JOIN people p ON true
LEFT JOIN allocated a ON a.person_id = p.id AND a.week_start = w.week_start
ORDER BY p.id, w.week_start
`

func (s *server) handleCapacity(w http.ResponseWriter, r *http.Request) {
	from, to, err := parseCapacityRange(r.URL.Query().Get("from"), r.URL.Query().Get("to"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	rows, err := s.db.Query(r.Context(), capacityQuery, from, to)
	if err != nil {
		log.Printf("capacity query: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to load capacity."})
		return
	}
	defer rows.Close()

	result := capacityResponse{Weeks: []capacityWeek{}, People: []personCapacity{}}
	seenWeeks := make(map[string]bool)
	for rows.Next() {
		var week capacityWeek
		var cell weekCapacity
		// The left join preserves week metadata even if there are no people.
		var id *int
		var name *string
		var weeklyHours *float64
		if err := rows.Scan(&week.WeekStart, &week.From, &week.To, &week.WorkingDays,
			&id, &name, &weeklyHours, &cell.AllocatedHours, &cell.CapacityHours); err != nil {
			log.Printf("capacity scan: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to load capacity."})
			return
		}

		if !seenWeeks[week.WeekStart] {
			result.Weeks = append(result.Weeks, week)
			seenWeeks[week.WeekStart] = true
		}
		if id == nil {
			continue
		}
		// Rows are ordered by person ID, then week, so each person's cells are contiguous.
		if len(result.People) == 0 || result.People[len(result.People)-1].ID != *id {
			result.People = append(result.People, personCapacity{
				ID: *id, Name: *name, WeeklyHours: *weeklyHours,
				Weeks: make([]weekCapacity, 0),
			})
		}
		cell.WeekStart = week.WeekStart
		person := &result.People[len(result.People)-1]
		person.Weeks = append(person.Weeks, cell)
	}
	if err := rows.Err(); err != nil {
		log.Printf("capacity rows: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Unable to load capacity."})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func parseCapacityRange(fromValue, toValue string) (time.Time, time.Time, error) {
	from, err := time.Parse(dateLayout, fromValue)
	if err != nil || from.Year() < 1 || from.Format(dateLayout) != fromValue {
		return time.Time{}, time.Time{}, errors.New("from must be a valid date in YYYY-MM-DD format (years 0001-9999).")
	}
	to, err := time.Parse(dateLayout, toValue)
	if err != nil || to.Year() < 1 || to.Format(dateLayout) != toValue {
		return time.Time{}, time.Time{}, errors.New("to must be a valid date in YYYY-MM-DD format (years 0001-9999).")
	}
	if from.After(to) {
		return time.Time{}, time.Time{}, errors.New("from must be on or before to.")
	}
	if to.After(from.AddDate(0, 0, maxRangeDays-1)) {
		return time.Time{}, time.Time{}, errors.New("Date range must contain at most 366 calendar days, including both endpoints.")
	}
	return from, to, nil
}
