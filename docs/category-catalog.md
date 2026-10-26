# Development category catalog

The synthetic catalog contains six event categories and no users, credentials,
purchased tickets or third-party event snapshots.

After reviewing the target development/test database and applying the managed
migrations, explicitly run:

```sh
npm run seed:categories -- --apply
```

The command is unavailable in production/provision. It does not create/drop the
database or run migrations. Writes share one transaction. Existing rows matched
by code retain their category_id; only the catalog name is updated. Conflicting
primary keys fail instead of silently replacing records.

Failures print a generic message rather than database credentials or queries.
The seed and its mock specification were added, not executed. Do not use the
old manual SQL/demo seed scripts with this reconstructed schema.
