import { useState, useEffect } from 'react';
import { Modal, ModalFooter, Button } from '@/components/ui';
import { ChefHat, Loader2 } from 'lucide-react';
import styles from './GeneratingListModal.module.css';

interface GeneratingListModalProps {
  isOpen: boolean;
  onCancel: () => void;
  isAnalyzingIngredients: boolean;
}

// Fun cooking-themed messages for the loading states
const GATHERING_MESSAGES = [
  "Raiding the recipe pantry...",
  "Gathering ingredients from your meal plan...",
  "Checking what's cooking this week...",
  "Peeking into your recipe collection...",
  "Assembling your culinary shopping adventure...",
];

const ANALYZING_MESSAGES = [
  "Teaching our AI chef to recognize ingredients...",
  "Our sous chef is checking for duplicates...",
  "Comparing apples to apples (and chicken to chicken)...",
  "Making sure you don't buy garlic twice... unless you really love garlic!",
  "Spotting ingredients wearing different disguises...",
  "Our kitchen assistant is tidying up the list...",
  "Checking if 'boneless chicken' and 'chicken breast' are BFFs...",
  "Converting cups to tablespoons (the math is hard)...",
  "Figuring out how much a 'bunch' of cilantro weighs...",
  "Estimating how heavy those chicken breasts are...",
  "Combining all your chicken into one mega-chicken entry...",
];

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

export function GeneratingListModal({
  isOpen,
  onCancel,
  isAnalyzingIngredients,
}: GeneratingListModalProps) {
  const [gatheringMessage, setGatheringMessage] = useState('');
  const [analyzingMessage, setAnalyzingMessage] = useState('');

  // Pick random messages when modal opens
  useEffect(() => {
    if (isOpen) {
      setGatheringMessage(getRandomMessage(GATHERING_MESSAGES));
      setAnalyzingMessage(getRandomMessage(ANALYZING_MESSAGES));
    }
  }, [isOpen]);

  const message = isAnalyzingIngredients ? analyzingMessage : gatheringMessage;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title=""
      size="sm"
    >
      <div className={styles.container}>
        <div className={styles.iconWrapper}>
          <ChefHat size={48} className={styles.chefHat} />
          <Loader2 size={24} className={styles.spinner} />
        </div>

        <h2 className={styles.title}>
          {isAnalyzingIngredients ? "Analyzing Ingredients" : "Creating Your List"}
        </h2>

        <p className={styles.message}>
          {message}
        </p>

        <div className={styles.progressDots}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}
