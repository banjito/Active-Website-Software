-- Create meetings schema for EOS-style operations tool
-- This schema will contain all tables for the meetings portal

-- Create the meetings schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS meetings;

-- Enable RLS for all tables in meetings schema
ALTER DEFAULT PRIVILEGES IN SCHEMA meetings GRANT ALL ON TABLES TO authenticated;

-- Teams table (for multi-tenant support)
CREATE TABLE IF NOT EXISTS meetings.teams (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  active BOOLEAN DEFAULT true
);

-- People table (users within teams)
CREATE TABLE IF NOT EXISTS meetings.people (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'member', 'viewer')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);

-- Meetings table
CREATE TABLE IF NOT EXISTS meetings.meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  title TEXT NOT NULL,
  ended BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Agenda items table
CREATE TABLE IF NOT EXISTS meetings.agenda_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID REFERENCES meetings.meetings(id) ON DELETE CASCADE,
  order_num INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('scorecard', 'rocks', 'customer', 'people', 'headlines', 'issues', 'todoReview', 'custom')),
  duration_min INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notes table
CREATE TABLE IF NOT EXISTS meetings.notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID REFERENCES meetings.meetings(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  linked_entity_type TEXT CHECK (linked_entity_type IN ('issue', 'rock', 'todo')),
  linked_entity_id UUID,
  decisions TEXT[] DEFAULT '{}' -- Array of decision strings
);

-- To-dos table
CREATE TABLE IF NOT EXISTS meetings.todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id UUID REFERENCES meetings.people(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'blocked')),
  created_in_meeting_id UUID REFERENCES meetings.meetings(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metrics table
CREATE TABLE IF NOT EXISTS meetings.metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT,
  target DECIMAL,
  threshold_low DECIMAL,
  threshold_high DECIMAL,
  owner_id UUID REFERENCES meetings.people(id),
  cadence TEXT NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('weekly', 'monthly')),
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metric points table (weekly data entries)
CREATE TABLE IF NOT EXISTS meetings.metric_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  metric_id UUID REFERENCES meetings.metrics(id) ON DELETE CASCADE,
  week_of DATE NOT NULL, -- Monday of the week
  value DECIMAL,
  entered_by UUID REFERENCES auth.users(id),
  entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(metric_id, week_of)
);

-- Rocks table (quarterly goals)
CREATE TABLE IF NOT EXISTS meetings.rocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id UUID REFERENCES meetings.people(id),
  quarter TEXT NOT NULL, -- Format: "2024-Q1"
  status TEXT NOT NULL DEFAULT 'onTrack' CHECK (status IN ('onTrack', 'offTrack', 'done')),
  confidence INTEGER DEFAULT 3 CHECK (confidence >= 0 AND confidence <= 5),
  milestones JSONB DEFAULT '[]', -- Array of {title: string, done: boolean}
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Issues table
CREATE TABLE IF NOT EXISTS meetings.issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT,
  priority INTEGER NOT NULL DEFAULT 2 CHECK (priority IN (1, 2, 3)), -- 1=high, 2=medium, 3=low
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'inMeeting', 'solved', 'archived')),
  owner_id UUID REFERENCES meetings.people(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization nodes table (accountability chart)
CREATE TABLE IF NOT EXISTS meetings.org_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES meetings.org_nodes(id),
  title TEXT NOT NULL,
  person_id UUID REFERENCES meetings.people(id),
  roles TEXT[] DEFAULT '{}', -- Array of role strings
  order_num INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- V/TO table (Vision/Traction Organizer)
CREATE TABLE IF NOT EXISTS meetings.vto (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES meetings.teams(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  sections JSONB NOT NULL DEFAULT '{}', -- JSON object with section names as keys
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Meeting issues junction table (for tracking which issues were discussed in meetings)
CREATE TABLE IF NOT EXISTS meetings.meeting_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID REFERENCES meetings.meetings(id) ON DELETE CASCADE,
  issue_id UUID REFERENCES meetings.issues(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(meeting_id, issue_id)
);

-- Meeting todos junction table (for tracking which todos were created in meetings)
CREATE TABLE IF NOT EXISTS meetings.meeting_todos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID REFERENCES meetings.meetings(id) ON DELETE CASCADE,
  todo_id UUID REFERENCES meetings.todos(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(meeting_id, todo_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meetings_team_date ON meetings.meetings(team_id, date);
CREATE INDEX IF NOT EXISTS idx_agenda_items_meeting_order ON meetings.agenda_items(meeting_id, order_num);
CREATE INDEX IF NOT EXISTS idx_notes_meeting ON meetings.notes(meeting_id);
CREATE INDEX IF NOT EXISTS idx_todos_team_status ON meetings.todos(team_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_owner ON meetings.todos(owner_id);
CREATE INDEX IF NOT EXISTS idx_metrics_team ON meetings.metrics(team_id, archived);
CREATE INDEX IF NOT EXISTS idx_metric_points_week ON meetings.metric_points(metric_id, week_of);
CREATE INDEX IF NOT EXISTS idx_rocks_team_quarter ON meetings.rocks(team_id, quarter);
CREATE INDEX IF NOT EXISTS idx_issues_team_status ON meetings.issues(team_id, status);
CREATE INDEX IF NOT EXISTS idx_org_nodes_team_parent ON meetings.org_nodes(team_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_vto_team_version ON meetings.vto(team_id, version);

-- Enable Row Level Security
ALTER TABLE meetings.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.metric_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.rocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.org_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.vto ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.meeting_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings.meeting_todos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Teams: Users can access teams they are members of
CREATE POLICY "Users can access their teams" ON meetings.teams
  FOR ALL USING (
    id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

-- People: Users can access people in their teams
CREATE POLICY "Users can access people in their teams" ON meetings.people
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

-- Apply similar policies to other tables
CREATE POLICY "Users can access meetings in their teams" ON meetings.meetings
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access agenda items for their team meetings" ON meetings.agenda_items
  FOR ALL USING (
    meeting_id IN (
      SELECT m.id FROM meetings.meetings m
      JOIN meetings.people p ON m.team_id = p.team_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access notes for their team meetings" ON meetings.notes
  FOR ALL USING (
    meeting_id IN (
      SELECT m.id FROM meetings.meetings m
      JOIN meetings.people p ON m.team_id = p.team_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access todos in their teams" ON meetings.todos
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access metrics in their teams" ON meetings.metrics
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access metric points for their team metrics" ON meetings.metric_points
  FOR ALL USING (
    metric_id IN (
      SELECT m.id FROM meetings.metrics m
      JOIN meetings.people p ON m.team_id = p.team_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access rocks in their teams" ON meetings.rocks
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access issues in their teams" ON meetings.issues
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access org nodes in their teams" ON meetings.org_nodes
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access VTO in their teams" ON meetings.vto
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM meetings.people 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access meeting issues for their team meetings" ON meetings.meeting_issues
  FOR ALL USING (
    meeting_id IN (
      SELECT m.id FROM meetings.meetings m
      JOIN meetings.people p ON m.team_id = p.team_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access meeting todos for their team meetings" ON meetings.meeting_todos
  FOR ALL USING (
    meeting_id IN (
      SELECT m.id FROM meetings.meetings m
      JOIN meetings.people p ON m.team_id = p.team_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Functions for automatic week rollover and quarter rollover
CREATE OR REPLACE FUNCTION meetings.get_week_start(date_input DATE DEFAULT CURRENT_DATE)
RETURNS DATE AS $$
BEGIN
  RETURN date_input - EXTRACT(DOW FROM date_input)::INTEGER + 1; -- Monday of the week
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION meetings.create_metric_point_stubs()
RETURNS void AS $$
DECLARE
  current_week DATE := meetings.get_week_start();
BEGIN
  -- Create metric point stubs for all active metrics for the current week
  INSERT INTO meetings.metric_points (metric_id, week_of)
  SELECT m.id, current_week
  FROM meetings.metrics m
  WHERE m.archived = false
    AND NOT EXISTS (
      SELECT 1 FROM meetings.metric_points mp
      WHERE mp.metric_id = m.id AND mp.week_of = current_week
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get current quarter string
CREATE OR REPLACE FUNCTION meetings.get_current_quarter()
RETURNS TEXT AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  current_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE);
  quarter_num INTEGER;
BEGIN
  quarter_num := CASE 
    WHEN current_month BETWEEN 1 AND 3 THEN 1
    WHEN current_month BETWEEN 4 AND 6 THEN 2
    WHEN current_month BETWEEN 7 AND 9 THEN 3
    ELSE 4
  END;
  
  RETURN current_year || '-Q' || quarter_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger functions for updated_at timestamps
CREATE OR REPLACE FUNCTION meetings.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON meetings.teams
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON meetings.people
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings.meetings
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_agenda_items_updated_at BEFORE UPDATE ON meetings.agenda_items
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON meetings.todos
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_metrics_updated_at BEFORE UPDATE ON meetings.metrics
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_rocks_updated_at BEFORE UPDATE ON meetings.rocks
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_issues_updated_at BEFORE UPDATE ON meetings.issues
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

CREATE TRIGGER update_org_nodes_updated_at BEFORE UPDATE ON meetings.org_nodes
  FOR EACH ROW EXECUTE FUNCTION meetings.update_updated_at_column();

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA meetings TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA meetings TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA meetings TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA meetings TO authenticated;
