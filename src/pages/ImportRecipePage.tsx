import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowLeft, Camera, Link as LinkIcon, FileText, Database } from 'lucide-react';
import { Card, CardBody } from '@/components/ui';
import { TextImportTab, UrlImportTab, PhotoImportTab, BulkImportTab } from '@/components/import';
import type { ImportMethod } from '@/types';
import styles from './ImportRecipePage.module.css';

const TABS: { id: ImportMethod; label: string; icon: React.ReactNode }[] = [
  { id: 'photo', label: 'Photo', icon: <Camera size={20} /> },
  { id: 'url', label: 'URL', icon: <LinkIcon size={20} /> },
  { id: 'text', label: 'Text', icon: <FileText size={20} /> },
  { id: 'bulk', label: 'Bulk Import', icon: <Database size={20} /> },
];

const TAB_STORAGE_KEY = 'platecraft_import_active_tab';
const TAB_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes, matching other import state

function getStoredTab(): ImportMethod | null {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    if (Date.now() - parsed.timestamp > TAB_EXPIRY_MS) {
      localStorage.removeItem(TAB_STORAGE_KEY);
      return null;
    }

    // Validate it's a valid tab id
    const validTabs: ImportMethod[] = ['photo', 'url', 'text', 'bulk'];
    if (validTabs.includes(parsed.tab)) {
      return parsed.tab;
    }
    return null;
  } catch {
    return null;
  }
}

export function ImportRecipePage() {
  const [activeTab, setActiveTab] = useState<ImportMethod>('photo');
  const hasRestoredRef = useRef(false);

  // Restore tab from localStorage on mount
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const stored = getStoredTab();
    if (stored && stored !== activeTab) {
      setActiveTab(stored);
    }
  }, []);

  // Persist active tab to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify({
        tab: activeTab,
        timestamp: Date.now(),
      }));
    } catch (err) {
      console.warn('Failed to persist active tab:', err);
    }
  }, [activeTab]);

  const tabsRef = useRef<HTMLDivElement>(null);

  // Handle tab change with iOS Safari rendering workaround
  const handleTabChange = (tab: ImportMethod) => {
    // Use flushSync to force synchronous DOM update
    flushSync(() => {
      setActiveTab(tab);
    });
    // Force iOS Safari to repaint by toggling transform
    if (tabsRef.current) {
      tabsRef.current.style.transform = 'translateZ(0)';
      requestAnimationFrame(() => {
        if (tabsRef.current) {
          tabsRef.current.style.transform = '';
        }
      });
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'photo':
        return <PhotoImportTab />;
      case 'url':
        return <UrlImportTab />;
      case 'text':
        return <TextImportTab />;
      case 'bulk':
        return <BulkImportTab />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link to="/" className={styles.backLink}>
          <ArrowLeft size={20} />
          <span>Back</span>
        </Link>
        <h1 className={styles.title}>Import Recipe</h1>
      </div>

      <Card>
        <CardBody className={styles.cardBody}>
          <div className={styles.tabs} ref={tabsRef}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className={styles.tabPanel}>
            {renderTabContent()}
          </div>
        </CardBody>
      </Card>

      <div className={styles.helpText}>
        <h3>How it works</h3>
        <ul>
          <li>
            <strong>Photo:</strong> Upload an image of a recipe and OCR will extract the text
          </li>
          <li>
            <strong>URL:</strong> Paste a link from any recipe website to import automatically
          </li>
          <li>
            <strong>Text:</strong> Paste recipe text and AI will parse it into structured fields
          </li>
          <li>
            <strong>Bulk Import:</strong> Automatically search and import multiple low-fat recipes from popular sites
          </li>
        </ul>
        <p>
          All methods preview the parsed recipe before saving, so you can make corrections.
        </p>
      </div>
    </div>
  );
}
