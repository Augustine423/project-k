const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MiniCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const days = buildCalendarDays(year, month);

  return (
    <div className="mini-calendar" id="calendar">
      <h3 className="widget-title">
        {MONTHS[month]} {year}
      </h3>
      <div className="mini-calendar-grid" role="grid" aria-label={`${MONTHS[month]} ${year}`}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="mini-calendar-weekday" role="columnheader">
            {d}
          </span>
        ))}
        {days.map((day, i) => (
          <span
            key={i}
            className={`mini-calendar-day${day === today ? " is-today" : ""}${day === null ? " is-empty" : ""}`}
            role="gridcell"
            aria-current={day === today ? "date" : undefined}
          >
            {day ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
