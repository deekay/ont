# Supabase Setup

This is the clean path for moving the Open Name Tags resolver/indexer off local snapshot files and onto your Supabase-backed Postgres.

The current code uses one simple document table:

- `public.ont_documents`

That table stores:

- resolver/indexer snapshot state
- destination-record store state

It does **not** yet break state into many relational tables. This is intentional for the current durability phase.

## 1. Create A Separate Supabase Project

Recommended:

- create a new project just for Open Name Tags
- keep it separate from any existing app data
- use a region reasonably close to the VPS if you care about latency

Suggested project naming:

- project name: `ont`
- database password: generate a strong one and save it immediately

## 2. Open The SQL Editor

In Supabase:

1. open the new Open Name Tags project
2. go to `SQL Editor`
3. create a new query
4. paste the contents of [ont_documents.sql](../../supabase/ont_documents.sql)
5. run it

That creates:

- schema `public` if needed
- table `public.ont_documents`
- index `ont_documents_updated_at_idx`

## 3. Copy The Postgres Connection String

In Supabase:

1. go to `Project Settings`
2. go to `Database`
3. find the Postgres connection strings
4. copy the `Session pooler` connection string

Use the session pooler unless you have a specific reason to use a direct connection.

You will replace the placeholder password in that URL with your actual database password.

The final value should look roughly like:

```text
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

## 4. Update The VPS Env File

SSH into the VPS:

```bash
ssh -i ~/.ssh/<your-key> root@<server-ip>
```

Edit the Open Name Tags env file:

```bash
nano /etc/ont/ont.env
```

Set or update these values:

```bash
ONT_DATABASE_URL=postgresql://...
ONT_DATABASE_SCHEMA=public
ONT_SNAPSHOT_KEY=resolver
ONT_VALUE_STORE_KEY=resolver
```

You should leave the existing RPC and web settings alone.

## 5. Restart The Services

On the VPS:

```bash
systemctl restart ont-resolver
systemctl restart ont-web
```

Then check health:

```bash
curl -s http://127.0.0.1:8787/health | jq
```

What you want to see:

- `"ok": true`
- `snapshotPath` showing something like:
  - `public:indexer_snapshot/resolver`
- `valueStorePath` showing something like:
  - `public:value_record_store/resolver`

That tells you the resolver is using Postgres-backed storage instead of local files.

## 6. Confirm The Site Still Works

After the restart, verify:

```bash
curl -s https://opennametags.org/api/health | jq '{ok, snapshotPath, valueStorePath, stats}'
curl -s https://opennametags.org/api/names | jq '.names | length'
```

## 7. Optional: Private Demo Too

If you also want the private signet side to use Supabase-backed storage, update:

```bash
nano /etc/ont/ont-private.env
```

Set:

```bash
ONT_DATABASE_URL=postgresql://...
ONT_DATABASE_SCHEMA=public
ONT_SNAPSHOT_KEY=private-resolver
ONT_VALUE_STORE_KEY=private-resolver
```

Then restart:

```bash
systemctl restart ont-private-resolver
systemctl restart ont-private-web
```

Using different keys keeps the public and private demo state from overwriting each other.

## 8. Rollback If Something Goes Wrong

If the resolver fails after adding `ONT_DATABASE_URL`:

1. remove or comment out `ONT_DATABASE_URL`
2. restart `ont-resolver` and `ont-web`

The app will fall back to file-backed persistence.

## Notes

- local development does not need Supabase
- the resolver can create the table automatically if needed, but running the SQL file first is cleaner and more explicit
- the current persistence model is document-style, not fully normalized relational storage
- once Supabase is enabled, deploys and restarts should be less dependent on local snapshot files under `/var/lib/ont`
