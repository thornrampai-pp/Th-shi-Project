import { createApp } from './app';
import { env } from './config/env';

createApp()
  .then((app) => {
    app.listen(env.PORT, () => {
      console.log(`🚀 Server ready at http://localhost:${env.PORT}/graphql`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
