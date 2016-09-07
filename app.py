import os
import json
import psycopg2
import uuid

from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT, POLL_OK
from psycopg2.extras import RealDictCursor
from uuid import UUID
from tornado.ioloop import IOLoop
from tornado.httpserver import HTTPServer
from tornado.web import HTTPError, RequestHandler, Application as BaseApplication
from tornado.websocket import WebSocketHandler

dsn = dict(
    database='incidents',
    user='qgis',
    password='qgis'
)

conn = psycopg2.connect(**dsn)
conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)

clients = []

class Application(BaseApplication):
    def __init__(self):
        handlers = [
            (r'/', IndexHandler),
            (r'/incidents/?', IncidentHandler),
            (r'/incidents/(?P<uuid>[a-zA-z0-9-]+)/?', IncidentHandler),
            (r'/ws/notifications/?', NotificationSocketHandler),
        ]
        settings = dict(
            static_path=os.path.join(os.path.dirname(__file__), "static"),
            # auto_reload=True,
            # debug=True
        )
        super(Application, self).__init__(handlers, **settings)

class IndexHandler(RequestHandler):
    def get(self):
        self.render("index.html")

class IncidentHandler(RequestHandler):
    def get(self, uuid=None):
        """ Get an incident or index """
        if uuid:
            incident = self._get_incident_by_uuid(uuid)
            if not incident:
                raise HTTPError(404)
            self.write(incident)
        else:
            incidents = self._get_all_incidents()
            self.write(incidents)

    def _get_incident_by_uuid(self, uuid):
        sql = """
        SELECT
            uuid, name, to_char(occurred_at, 'Mon, DD HH:MM') AS occurred_at,
            ST_AsGeoJSON(location)::json as feature
        FROM incidents WHERE uuid=%s;
        """
        if self._is_valid_uuid_v4(uuid):
            return self._query(sql, [uuid])[0]

        return None

    def _get_all_incidents(self):
        sql = """
        SELECT
            'FeatureCollection' AS type,
            json_build_object(
                'type', 'name',
                'properties', json_build_object('name', 'EPSG:4326')
            ) AS crs,
            array_to_json(array_agg(f)) AS features
        FROM (
            SELECT
                'Feature' AS type,
                uuid AS id,
                ST_AsGeoJSON(location)::json AS geometry,
                row_to_json((SELECT p FROM (SELECT uuid, name, to_char(occurred_at, 'Mon, DD HH:MM') AS occurred_at) AS p)) AS properties
            FROM incidents
            ORDER BY occurred_at DESC
        ) AS f;
        """
        return self._query(sql)[0]

    def _query(self, sql, *args, **kwargs):
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(sql, *args, **kwargs)
        result = cursor.fetchall()
        cursor.close()
        return result

    def _is_valid_uuid_v4(self, uuid_string):
        try:
            _uuid = uuid.UUID(uuid_string, version=4)
        except ValueError:
            return False

        return str(_uuid) == uuid_string

class NotificationSocketHandler(WebSocketHandler):
    def open(self):
        if self not in clients:
            clients.append(self)

    def on_message(self, message):
        pass

    def on_db_notification(self, notification):
        for row in notification:
            self.write_message(row.payload)

    def on_close(self):
        if self in clients:
            clients.remove(self)

def listen():
    cursor = conn.cursor()
    cursor.execute('LISTEN incidents')

def receive(fd, events):
    state = conn.poll()
    if state == POLL_OK and conn.notifies:
        # print("Message received: %s" % conn.notifies[0].payload)
        for client in clients:
            client.on_db_notification(conn.notifies)
        del conn.notifies[:]

def main():
    print("Go to: http://localhost:8888/")

    listen()

    app = Application()

    http_server = HTTPServer(app)
    http_server.listen(8888)

    io_loop = IOLoop.instance()
    io_loop.add_handler(conn.fileno(), receive, io_loop.READ)
    io_loop.start()


if __name__ == '__main__':
    main()
