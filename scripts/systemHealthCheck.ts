// scripts/systemHealthCheck.ts
// Comprehensive health check for the entire FTH infrastructure

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface HealthStatus {
  component: string;
  status: "✅" | "⚠️" | "❌";
  message: string;
}

async function checkDatabase(): Promise<HealthStatus> {
  try {
    await prisma.$connect();
    const memberCount = await prisma.member.count();
    await prisma.$disconnect();
    return {
      component: "PostgreSQL Database",
      status: "✅",
      message: `Connected successfully (${memberCount} members in system)`,
    };
  } catch (error) {
    return {
      component: "PostgreSQL Database",
      status: "❌",
      message: `Connection failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

async function checkEnvironmentVariables(): Promise<HealthStatus> {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length === 0) {
    return {
      component: "Environment Variables",
      status: "✅",
      message: `All required variables present (${required.length}/${required.length})`,
    };
  } else {
    return {
      component: "Environment Variables",
      status: "❌",
      message: `Missing: ${missing.join(", ")}`,
    };
  }
}

function checkDatabaseURL(): HealthStatus {
  const dbUrl = process.env.DATABASE_URL || "";
  
  if (dbUrl.includes("@localhost:5432")) {
    return {
      component: "Database URL Configuration",
      status: "✅",
      message: "Correctly configured for host-side access (localhost:5432)",
    };
  } else if (dbUrl.includes("@fth-postgres:5432")) {
    return {
      component: "Database URL Configuration",
      status: "⚠️",
      message: "Using container hostname (fth-postgres) - only works from inside Docker",
    };
  } else if (!dbUrl) {
    return {
      component: "Database URL Configuration",
      status: "❌",
      message: "DATABASE_URL not set in .env",
    };
  } else {
    return {
      component: "Database URL Configuration",
      status: "⚠️",
      message: "Non-standard configuration detected",
    };
  }
}

async function main() {
  console.log("🏥 FTH PROGRAM INFRASTRUCTURE HEALTH CHECK");
  console.log("==========================================\n");

  const checks: HealthStatus[] = [];

  // Run all health checks
  checks.push(await checkEnvironmentVariables());
  checks.push(checkDatabaseURL());
  checks.push(await checkDatabase());

  // Display results
  checks.forEach((check) => {
    console.log(`${check.status} ${check.component}`);
    console.log(`   ${check.message}\n`);
  });

  // Overall status
  const failed = checks.filter((c) => c.status === "❌").length;
  const warnings = checks.filter((c) => c.status === "⚠️").length;
  const passed = checks.filter((c) => c.status === "✅").length;

  console.log("==========================================");
  console.log(`📊 Summary: ${passed} passed, ${warnings} warnings, ${failed} failed\n`);

  if (failed > 0) {
    console.log("❌ System is NOT ready for development");
    console.log("\nAction required:");
    console.log("  1. Check Docker containers: docker ps");
    console.log("  2. Verify .env configuration");
    console.log("  3. Run: npx prisma migrate dev");
    process.exit(1);
  } else if (warnings > 0) {
    console.log("⚠️  System is operational but has warnings");
    console.log("\nReview warnings above and fix if needed");
    process.exit(0);
  } else {
    console.log("✅ All systems operational!");
    console.log("\nYour infrastructure is ready:");
    console.log("  - PostgreSQL: Connected");
    console.log("  - Environment: Configured");
    console.log("  - Prisma: Ready");
    console.log("\nNext steps:");
    console.log("  - Run tests: npm test");
    console.log("  - Start development: npm run dev (when implemented)");
    console.log("  - Check docs: docs/DOCKER_NETWORKING.md");
    process.exit(0);
  }
}

main().catch((error) => {
  console.error("❌ Health check failed:", error);
  process.exit(1);
});
