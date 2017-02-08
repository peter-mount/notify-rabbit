# notify-rabbit
## Introduction
This is a simple nodejs application that allows PostgreSQL to send messages to a RabbitMQ server using the notify command.

For example, in SQL you can issue one of the following commands:

```
NOTIFY queue, 'some message';

SELECT pg_notify('queue','some message');
```

This application will then immediately send a message to a RabbitMQ topic with that message to a configured routing key.
You can then have an application listen for messages with that key and process those events immediately.

## Configuration

You need to provide a config.yaml file containing details about your database - a template is provided in the repository.

It consists of three sections:

### databases
This section contains connection details to connect to your databases:

```
databases:
    testDB:
        enabled: true
        host: localhost
        port: 5432
        database: postgres
        user: postgres
        password: postgres
        ssl: false
```

Here we have just one database configured called testDB which will be referred to later.

### rabbit
This section defines details of the rabbitmq instances you want to connect to.
It simply consists of a name for the instance and the connection URI to connect to it.

```
rabbit:
    testRabbit: amqp://guest:password@localhost
```

Note: You can put an IP address here instead of the hostname.
If it's an IPv6 address then wrap it within a pair of [ ].

### notify
This section defines which databases you want to listen to for notifications.
You usually have one entry per database (but you are not limited to this).

#### Simple messages

```
notify:
    -
        enabled: true
        database: testdb
        name: rabbit
        handlers:
            rabbit:
                instance: testRabbit
                key: job.status
```

Here we are telling the application to listen for notifications sent to the 'rabbit' queue on the testdb database.
All messages received would be sent as-is to the testRabbit RabbitMQ instance with the routing key 'job.status'.

Then from PostgreSQL you can use:

```
SELECT pg_notify('rabbit','My message');
```

to send the message.

#### Set the routing key in PostgreSQL

This is a simple case, you can allow PostgreSQL to define the routing key:

```
notify:
    -
        enabled: true
        database: testdb
        name: rabbit
        json: true
        handlers:
            rabbit:
                instance: testRabbit
                routingKey: key
                payload: body
```

Here we are telling the application to expect a JSON object from PostgreSQL with two properties.
* "key" will contain the routing key to use
* "body" will contain the message to send.

```
SELECT pg_notify('rabbit','{"key":"job.status","body": "My message"}');
```

Note: "payload" is optional here. If absent then the original message will be sent including the routing key etc.

## Running
To run first create a config.yaml file with your configuration then run:
```
docker run -d -v $(pwd)/config.yaml:/opt/config.yaml area51/node-notify
```

## Online examples
* [Area51 Job Status](http://area51.onl/status/job/) is a web page showing various job statuses. It connects to RabbitMQ over a websocket and receives events from a table in a PostgreSQL database. Updates are sent by a trigger in the db via RabbitMQ to the webpage.

## PostgreSQL Trigger example

Given a simple table containing three columns:
* id INTEGER
* name NAME
* dt TIMESTAMP

We could then create a simple trigger to send a message whenever a row is inserted or updated:

```
CREATE OR REPLACE FUNCTION notifyupdate()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('rabbit', json_build_object(
        'key', CONCAT('table.', NEW.name),
        'body', json_build_object(
            'id', NEW.id,
            'name', NEW.name,
            'dt', to_char(NEW.dt, 'YYYY-MM-DDThh24:MI:SSZ')
        )
    );
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER notifystate
    AFTER INSERT OR UPDATE ON mytable
    FOR EACH ROW EXECUTE PROCEDURE notifyupdate();
```

Next config.yaml:
```
notify:
    -
        enabled: true
        database: testdb
        name: rabbit
        json: true
        handlers:
            rabbit:
                instance: testRabbit
                routingKey: key
                payload: body
```

Now you'll get a copy of the id, name & dt columns in a message with it's routing key consisting of table. and the name.

You could then listen for messages with "table.#" or just for a specific name in that table.
