import { execSync } from 'child_process';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const prismaBinary = path.join(__dirname, '../node_modules/.bin/prisma');

const runCommand = (command: string) => {
  try {
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
};

const main = async () => {
  const env = process.env.NODE_ENV || 'development';
  console.log(`Running database migrations for environment: ${env}`);

  switch (env) {
    case 'development':
      console.log('Applying migrations for development environment...');
      runCommand(`${prismaBinary} migrate dev --name init_fth_schema`);
      console.log('Development migrations applied successfully.');
      break;
    case 'staging':
    case 'production':
      console.log(`Applying migrations for ${env} environment...`);
      runCommand(`${prismaBinary} migrate deploy`);
      console.log(`${env} migrations applied successfully.`);
      break;
    default:
      console.error('Invalid NODE_ENV. Please set to development, staging, or production.');
      process.exit(1);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
