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
import { db } from '@/db';
import { IOSInstallBannerProvider } from '@/context/IOSInstallBannerContext';
import '@/styles/global.css';

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
    // Initialize the database on app start
    db.initialize().catch(console.error);
  }, []);

  return (
    <IOSInstallBannerProvider>
      <RouterProvider router={router} />
    </IOSInstallBannerProvider>
  );
}

export default App;
