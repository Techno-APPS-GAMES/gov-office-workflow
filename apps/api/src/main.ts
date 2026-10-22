import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Behind Next.js rewrite / tunnel — use real client IP for throttle + audit.
  const http = app.getHttpAdapter().getInstance();
  if (http?.set) http.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.APP_URL || 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  const port = Number(process.env.API_PORT || 4000);
  const publicHost = process.env.APP_URL || '';
  if (
    /walkwell|ngrok|cloudflare|trycloudflare/i.test(publicHost) &&
    process.env.PILOT_MODE !== 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      `[GOW] Public APP_URL (${publicHost}) with start:dev — set PILOT_MODE=true and use a production build for demos.`,
    );
  }
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`GOW API listening on :${port}`);
}
bootstrap();
