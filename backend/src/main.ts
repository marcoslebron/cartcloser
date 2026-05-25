import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for n8n and frontend
  app.enableCors({
    origin: [
      'http://localhost:3001',
      'http://localhost:5678',
      'http://n8n:5678',
      process.env.FRONTEND_URL,
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 CartCloser API running on http://localhost:${port}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'cartcloser'}`);
  console.log(`🔄 n8n: ${process.env.N8N_WEBHOOK_BASE_URL || 'http://localhost:5678'}`);
}

bootstrap();
