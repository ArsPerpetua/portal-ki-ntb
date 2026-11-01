import app from './app.js';
import { env } from './env.js';

app.listen(env.port, () => {
  console.log(`Portal KI NTB API berjalan di http://localhost:${env.port}`);
});
