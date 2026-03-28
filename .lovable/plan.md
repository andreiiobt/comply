

## Location-First Incident Reports View

### Summary
Restructure the admin incident reports page to show locations as the primary grouping, with summary stats per location. Clicking a location expands/navigates to show its reports. For managers, auto-scope to their assigned location and show the same detailed view directly.

### Admin View (`src/pages/admin/IncidentReports.tsx`)

**New layout — location cards as entry point:**
- Fetch all `locations` for the company
- Fetch all `incident_reports` and group by `location_id`
- Display each location as a clickable card showing:
  - Location name and address
  - Summary stats: total reports, open count, investigating count, resolved count
  - Most recent incident date
- Clicking a location card expands it (accordion/collapsible) or filters the table below to show only that location's reports
- Add a "No Location" group for reports without a `location_id`
- Keep the status filter, applied within the selected location
- Status change dropdown on each report row remains

**State management:**
- `selectedLocationId` state — `null` shows the location overview, selecting one shows its report table
- Breadcrumb-style back button: "All Locations → [Location Name]"

### Manager View (`src/pages/manager/IncidentReports.tsx`)

- Already scoped to `managerLocationId` — no location selection needed
- Fetch the location name/address and display it as a header card with the same summary stats (open, investigating, resolved, total)
- Below that, show the existing reports table (unchanged structure)

### Files to modify
- `src/pages/admin/IncidentReports.tsx` — full rewrite: location cards overview → drill-down report table
- `src/pages/manager/IncidentReports.tsx` — add location header card with summary stats above the existing table

