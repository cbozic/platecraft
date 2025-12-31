import { useState } from 'react';
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

export function ImportRecipePage() {
  const [activeTab, setActiveTab] = useState<ImportMethod>('text');

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
          <div className={styles.tabs}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab.id)}
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
