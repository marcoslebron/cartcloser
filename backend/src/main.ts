import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:5678',
    'http://n8n:5678',
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  app.enableCors({ origin: allowedOrigins, credentials: true });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 CartCloser API running on http://localhost:${port}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'cartcloser'}`);
  console.log(`🔄 n8n: ${process.env.N8N_WEBHOOK_BASE_URL || 'http://localhost:5678'}`);
}

bootstrap();
