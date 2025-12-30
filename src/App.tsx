import { useEffect } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import {
  RecipesPage,
  RecipeDetailPage,
  RecipeFormPage,
  CalendarPage,
  ShoppingPage,
  SettingsPage,
} from '@/pages';
import { db } from '@/db';
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
]);

function App() {
  useEffect(() => {
    // Initialize the database on app start
    db.initialize().catch(console.error);
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
