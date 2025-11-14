## Runway Meeting (EOS Level 10) Guide

This document defines the Runway meeting structure, navigation, and UI behavior mirroring EOS/90.io style Level 10 meetings.

### Overall Flow
- **My Runway (Dashboard)**: Pre-flight view consolidating key priorities
  - Flight Path (Rocks): 90-day goals and progress (On Track/Off Track)
  - To-Dos: Weekly action items (assignable, due dates, completion checkboxes)
  - Control Tower: Weekly KPI scorecard (Owner, Target, Actual, Status)
  - Upcoming Meetings: Next meetings from Meetings page

### Meeting Workflow (Takeoff → Baggage Claim)
1) **Takeoff**
   - Start Meeting button
   - Agenda overview with section timers (configurable)
   - Optional: Select template (Leadership/Department)

2) **Control Tower (Scorecard)**
   - Weekly metrics table: Owner | Metric | Target | Actual | Status (green/red)
   - Inline updates; flags issues to “Land the Plane” queue

3) **Flight Path (Rocks)**
   - List of Rocks with owners and progress
   - Status: On Track / Off Track; notes field

4) **To-Dos**
   - Previous meeting action items
   - Check to complete; add new To-Dos inline
   - Assigned to person, due date

5) **Land the Plane (Issues)**
   - Issues backlog with Prioritize function (drag to top 3)
   - Mark “Solved” or keep “Still Open”; add resolution notes

6) **Baggage Claim (Conclude)**
   - Recap: completed To-Dos, key decisions, unresolved issues
   - Assign new action items
   - Set next meeting date/time/team
   - Print/Email Summary button

### Meetings Page (Scheduling & Management)
- Tabs: Upcoming | Past | Team filter
- Buttons: Takeoff (Start active meeting) | Print Meeting Agenda
- Optional: Schedule Meeting (Title, Date, Team, Agenda template)

### UI/Feature Requirements
- **Agenda Templates**: Pre-load section order and timers
- **Section Timers**: Visible countdown; gentle alerts on time
- **Auto-Summary Log**: Generated at Baggage Claim (decisions, assignments)
- **To-Do Integration**: Meeting To-Dos flow into personal/team To-Dos
- **Permissions**: View/edit based on role; presenter controls timers/advances
- **Embed Mode**: `?embed=true` hides sidebars/headers for modal usage

### Data Model (Suggested)
- Meeting: id, title, date, teamId, templateId, status (scheduled|in_progress|complete)
- AgendaTemplate: id, name, sections[{key, label, durationMinutes, order}]
- ScorecardMetric: id, meetingId, ownerId, metric, target, actual, status
- Rock: id, meetingId, ownerId, title, status, notes
- Todo: id, meetingId, ownerId, title, dueDate, completed, source (meeting|personal)
- Issue: id, meetingId, title, ownerId, priority, status (open|solved), notes
- Summary: id, meetingId, content, createdAt

### Routes & Navigation
- My Runway: `/meetings/my-data`
- Takeoff: `/meetings`
- Control Tower: `/meetings/insights`
- Flight Path: `/meetings/rocks`
- To-Dos: `/meetings/todos`
- Land the Plane: `/meetings/issues`
- Terminal (Headlines): `/meetings/headlines`

### Print/Export
- Print Meeting Agenda: compile all sections into printable layout
- End-of-meeting summary: print/email PDF summary

### Implementation Notes
- Use dark mode pairs for all UI
- Respect existing `Layout` embed behavior
- Persist timers and section progress in state (resume capability)
- Consider Supabase tables under `neta_ops.meetings_*` schema


