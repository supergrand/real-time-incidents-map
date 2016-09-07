--
--  Create a spatial table
--
CREATE TABLE incidents (
  uuid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  location GEOGRAPHY(POINT, 4326) NOT NULL
);

--
--  Insert some data to it
--
INSERT INTO incidents
  (name, location)
VALUES
  ('Lorem ipsum dolor sit amet', ST_GeographyFromText('SRID=4326;POINT(17.058275 51.096763)'));

--
--  Create a function which will notify our application
--
CREATE FUNCTION incident_notification() RETURNS trigger AS $$
DECLARE
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_notify(TG_TABLE_NAME, json_build_object(
      'operation', 'insert', 'uuid', NEW.uuid
    )::text);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM pg_notify(TG_TABLE_NAME, json_build_object(
      'operation', 'update', 'uuid', NEW.uuid
    )::text);
    RETURN NEW;
  ELSE
    PERFORM pg_notify(TG_TABLE_NAME, json_build_object(
      'operation', 'delete', 'uuid', OLD.uuid
    )::text);
    RETURN OLD;
  END IF;
END
$$ LANGUAGE plpgsql;


--
--  Create trigger on the table
--
CREATE TRIGGER incident_trigger AFTER INSERT OR UPDATE OR DELETE ON incidents
  FOR EACH ROW EXECUTE PROCEDURE incident_notification();

-- LISTEN incidents;
