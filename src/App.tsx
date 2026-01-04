import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  RecipesPage,
  RecipeDetailPage,
  RecipeFormPage,
  ImportRecipePage,
  CalendarPage,
  ShoppingPage,
  SettingsPage,
} from '@/pages';
import { db, settingsRepository } from '@/db';
import { IOSInstallBannerProvider } from '@/context/IOSInstallBannerContext';
import '@/styles/global.css';

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme === 'system' ? '' : theme);
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <RecipesPage />,
      },
      {
        path: 'recipes/new',
        element: <RecipeFormPage />,
      },
      {
        path: 'recipes/:id',
        element: <RecipeDetailPage />,
      },
      {
        path: 'recipes/:id/edit',
        element: <RecipeFormPage />,
      },
      {
        path: 'import',
        element: <ImportRecipePage />,
      },
      {
        path: 'calendar',
        element: <CalendarPage />,
      },
      {
        path: 'shopping',
        element: <ShoppingPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
], {
  basename: '/platecraft',
});

function App() {
  useEffect(() => {
    // Initialize the database and apply saved theme on app start
    db.initialize()
      .then(() => settingsRepository.get())
      .then((settings) => {
        applyTheme(settings.theme);
      })
      .catch(console.error);
  }, []);

  return (
    <IOSInstallBannerProvider>
      <RouterProvider router={router} />
    </IOSInstallBannerProvider>
  );
}

export default App;
