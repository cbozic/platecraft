import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { tagRepository } from '@/db';
import type { Tag } from '@/types';
import styles from './TagManager.module.css';

export function TagManager() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [editingTag, setEditingTag] = useState<string | null>(null); // tag name being edited
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const allTags = await tagRepository.getAll();
      // Sort alphabetically
      allTags.sort((a, b) => a.name.localeCompare(b.name));
      setTags(allTags);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    // Check for duplicates (case-insensitive)
    const exists = tags.some(
      (t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()
    );
    if (exists) {
      alert('A tag with this name already exists');
      return;
    }

    try {
      await tagRepository.create(newTagName.trim(), newTagColor);
      setNewTagName('');
      setNewTagColor('#6366f1');
      await loadTags();
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag.name);
    setEditName(tag.name);
    setEditColor(tag.color || '#6366f1');
  };

  const handleSaveEdit = async () => {
    if (!editingTag || !editName.trim()) return;

    // Check for duplicates (excluding current tag, case-insensitive)
    const exists = tags.some(
      (t) =>
        t.name.toLowerCase() !== editingTag.toLowerCase() &&
        t.name.toLowerCase() === editName.trim().toLowerCase()
    );
    if (exists) {
      alert('A tag with this name already exists');
      return;
    }

    try {
      await tagRepository.update(editingTag, {
        name: editName.trim(),
        color: editColor,
      });
      setEditingTag(null);
      await loadTags();
    } catch (error) {
      console.error('Failed to update tag:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditName('');
    setEditColor('');
  };

  const handleDeleteTag = async (tag: Tag) => {
    if (window.confirm(`Delete "${tag.name}"? This will remove it from all recipes.`)) {
      try {
        await tagRepository.delete(tag.name);
        await loadTags();
      } catch (error) {
        console.error('Failed to delete tag:', error);
      }
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading tags...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Tags</h3>
          <span className={styles.count}>{tags.length} tags</span>
        </div>

        <div className={styles.createForm}>
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="New tag name"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className={styles.colorPicker}
            title="Tag color"
          />
          <Button onClick={handleCreateTag} disabled={!newTagName.trim()}>
            <Plus size={18} />
            Add
          </Button>
        </div>

        {tags.length === 0 ? (
          <p className={styles.emptyText}>No tags yet. Create one above.</p>
        ) : (
          <div className={styles.tagList}>
            {tags.map((tag) => (
              <div key={tag.name} className={styles.tagRow}>
                {editingTag === tag.name ? (
                  <div className={styles.editRow}>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit();
                        if (e.key === 'Escape') handleCancelEdit();
                      }}
                    />
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className={styles.colorPicker}
                    />
                    <Button variant="ghost" size="sm" onClick={handleSaveEdit}>
                      <Check size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                      <X size={16} />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className={styles.tagInfo}>
                      <span
                        className={styles.tagColor}
                        style={{ backgroundColor: tag.color || '#6366f1' }}
                      />
                      <span className={styles.tagName}>{tag.name}</span>
                    </div>
                    <div className={styles.tagActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleStartEdit(tag)}
                        aria-label="Edit tag"
                      >
                        <Edit2 size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteTag(tag)}
                        aria-label="Delete tag"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
