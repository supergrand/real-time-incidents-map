# Real time incidents map

Example of using Postgres LISTEN/NOTIFY with WebSockets to show features on a map in near real time.

## Installation

1. Setup a database with PostGIS and uuid-ossp extensions.

2. Change database name, user and password in `app.py`.

3. Execute the `schema.sql`

4. Install Python requirements:  

        $ pip install -r requirements.txt

5. Run:  

        $ python app.py

## License

MIT
