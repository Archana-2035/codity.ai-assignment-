const { execSync } = require('child_process');

const service = process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME;

if (!service) {
  console.error('ERROR: RAILWAY_SERVICE_NAME environment variable is not set!');
  console.error('Please set RAILWAY_SERVICE_NAME to "backend" or "frontend" in your deployment environment.');
  process.exit(1);
}

console.log(`Starting service: ${service}`);

try {
  if (service === 'backend') {
    // Inject required database and production variables
    // PostgreSQL config expects DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
    process.env.DB_HOST = "postgres.railway.internal";
    process.env.DB_PORT = "5432";
    process.env.DB_NAME = "railway";
    process.env.DB_USER = "postgres";
    process.env.DB_PASSWORD = "isPxXeWuqmuEqBOjqAqqHipIojeAdnou";
    process.env.DB_SSL = "false"; // Internal networking doesn't need SSL

    // Redis config expects REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
    process.env.REDIS_HOST = "redis.railway.internal";
    process.env.REDIS_PORT = "6379";
    process.env.REDIS_PASSWORD = "FZMbjGkVimambkxnruMQwuqpzKDTiuDS";

    process.env.JWT_SECRET = "super_secure_production_jwt_secret_key_123";
    process.env.PORT = "8080";
    process.env.FRONTEND_URL = "https://frontend-production-4af7.up.railway.app";
    process.env.API_BASE_URL = "http://localhost:8080/api/v1";
    process.env.QUEUE_IDS = "11111111-1111-4111-a111-111111111111,22222222-2222-4222-a222-222222222222,33333333-3333-4333-a333-333333333333";
    
    execSync('npm run start:backend', { stdio: 'inherit' });
  } else if (service === 'frontend') {
    execSync('npm run start:frontend', { stdio: 'inherit' });
  } else {
    console.error(`ERROR: Unknown service name: ${service}`);
    process.exit(1);
  }
} catch (error) {
  console.error(`Process exited with error:`, error.message);
  process.exit(error.status || 1);
}
