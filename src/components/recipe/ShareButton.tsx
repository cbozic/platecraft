import { useState, useEffect } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ShareModal } from './ShareModal';
import { tagRepository } from '@/db';
import type { Recipe } from '@/types';
import type { Tag } from '@/types/tags';
import styles from './ShareButton.module.css';

interface ShareButtonProps {
  recipe: Recipe;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md';
}

export function ShareButton({ recipe, variant = 'button', size = 'md' }: ShareButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    const loadTags = async () => {
      if (recipe.tags.length > 0) {
        const tagData = await tagRepository.getByNames(recipe.tags);
        setTags(tagData);
      }
    };
    loadTags();
  }, [recipe.tags]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsModalOpen(true);
  };

  const handleClose = () => {
    setIsModalOpen(false);
  };

  if (variant === 'icon') {
    return (
      <>
        <button
          className={`${styles.iconButton} ${styles[size]}`}
          onClick={handleClick}
          aria-label="Share recipe"
          title="Share recipe"
        >
          <Share2 size={size === 'sm' ? 16 : 20} />
        </button>
        <ShareModal
          isOpen={isModalOpen}
          onClose={handleClose}
          recipe={recipe}
          tags={tags}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size={size}
        leftIcon={<Share2 size={18} />}
        onClick={handleClick}
      >
        Share
      </Button>
      <ShareModal
        isOpen={isModalOpen}
        onClose={handleClose}
        recipe={recipe}
        tags={tags}
      />
    </>
  );
}
