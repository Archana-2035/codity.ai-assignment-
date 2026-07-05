const { spawnSync } = require('child_process');

process.env.DB_HOST = "postgres.railway.internal";
process.env.DB_PORT = "5432";
process.env.DB_NAME = "railway";
process.env.DB_USER = "postgres";
process.env.DB_PASSWORD = "isPxXeWuqmuEqBOjqAqqHipIojeAdnou";
process.env.DB_SSL = "false";

console.log('Running database seed with production credentials...');
const result = spawnSync('npm', ['run', 'db:seed', '-w', 'packages/backend'], { stdio: 'inherit', shell: true });

if (result.error) {
  console.error('Error running seed:', result.error);
  process.exit(1);
}

process.exit(result.status);
