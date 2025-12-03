import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Додаємо 'path' для коректної роботи зі шляхами
import * as path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        // Вказуємо кожну HTML-сторінку, яка повинна бути скомпільована
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
        login: path.resolve(__dirname, 'login.html'),
        test: path.resolve(__dirname, 'test-page.html'),
        history: path.resolve(__dirname, 'history-page.html'),
        results: path.resolve(__dirname, 'results-page.html'),
        register: path.resolve(__dirname, 'register.html'),
        upload: path.resolve(__dirname, 'upload-test.html'),
        indexAI: path.resolve(__dirname, 'indexAI.html'),
        // Якщо інші HTML-файли мають бути включені, додайте їх сюди
      },
    },
  },
});