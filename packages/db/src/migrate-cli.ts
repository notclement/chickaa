import { runMigrations } from './migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
runMigrations(url)
  .then(() => console.log('migrations applied'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
