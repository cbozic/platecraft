import { useState, useCallback } from 'react';
import { Button } from '@/components/ui';
import { Plus } from 'lucide-react';
import { IngredientChip } from './IngredientChip';
import type { PendingIngredientMatch, RefinedIngredientGroup } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import styles from './RefinementPanel.module.css';

interface RefinementPanelProps {
  match: PendingIngredientMatch;
  onCancel: () => void;
  onApply: (groups: RefinedIngredientGroup[]) => void;
}

interface GroupState {
  id: string;
  canonicalName: string;
  ingredientNames: Set<string>;
}

export function RefinementPanel({ match, onCancel, onApply }: RefinementPanelProps) {
  // Initialize with all ingredients in one group
  const [groups, setGroups] = useState<GroupState[]>(() => [
    {
      id: match.id,
      canonicalName: match.suggestedCanonicalName,
      ingredientNames: new Set(match.ingredientNames),
    },
  ]);

  // Track which ingredients are ungrouped
  const [ungrouped, setUngrouped] = useState<Set<string>>(new Set());

  // Helper to get affected recipes for a set of ingredient names
  const getAffectedRecipes = useCallback(
    (ingredientNames: string[]) => {
      return match.affectedRecipes.filter((r) =>
        ingredientNames.some(
          (name) => name.toLowerCase() === r.ingredientName.toLowerCase()
        )
      );
    },
    [match.affectedRecipes]
  );

  // Toggle an ingredient in a group
  const handleIngredientToggle = (groupId: string, ingredientName: string, isSelected: boolean) => {
    if (isSelected) {
      // Add to group, remove from ungrouped
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id === groupId) {
            const newNames = new Set(g.ingredientNames);
            newNames.add(ingredientName);
            return { ...g, ingredientNames: newNames };
          }
          return g;
        })
      );
      setUngrouped((prev) => {
        const newSet = new Set(prev);
        newSet.delete(ingredientName);
        return newSet;
      });
    } else {
      // Remove from group, add to ungrouped
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id === groupId) {
            const newNames = new Set(g.ingredientNames);
            newNames.delete(ingredientName);
            return { ...g, ingredientNames: newNames };
          }
          return g;
        })
      );
      setUngrouped((prev) => new Set([...prev, ingredientName]));
    }
  };

  // Update canonical name for a group
  const handleCanonicalNameChange = (groupId: string, newName: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, canonicalName: newName } : g))
    );
  };

  // Create a new group from ungrouped items
  const handleCreateGroup = () => {
    if (ungrouped.size === 0) return;

    const ungroupedArray = Array.from(ungrouped);
    const newGroup: GroupState = {
      id: uuidv4(),
      canonicalName: ungroupedArray[0],
      ingredientNames: new Set(ungroupedArray),
    };

    setGroups((prev) => [...prev, newGroup]);
    setUngrouped(new Set());
  };

  // Apply the refined groups
  const handleApply = () => {
    // Filter out empty groups and build RefinedIngredientGroup objects
    const refinedGroups: RefinedIngredientGroup[] = groups
      .filter((g) => g.ingredientNames.size > 0)
      .map((g) => ({
        id: g.id,
        ingredientNames: Array.from(g.ingredientNames),
        canonicalName: g.canonicalName.trim() || Array.from(g.ingredientNames)[0],
        affectedRecipes: getAffectedRecipes(Array.from(g.ingredientNames)),
      }));

    onApply(refinedGroups);
  };

  // Count total groups that will be created (groups with 2+ ingredients)
  const groupsToCreate = groups.filter((g) => g.ingredientNames.size >= 2).length;

  return (
    <div className={styles.panel}>
      {groups.map((group, index) => (
        <div key={group.id} className={styles.group}>
          <div className={styles.groupHeader}>
            <span className={styles.groupLabel}>GROUP {index + 1}:</span>
            <input
              type="text"
              className={styles.canonicalInput}
              value={group.canonicalName}
              onChange={(e) => handleCanonicalNameChange(group.id, e.target.value)}
              placeholder="Canonical name..."
            />
          </div>
          <div className={styles.chips}>
            {/* Show ingredients in this group (selected) */}
            {Array.from(group.ingredientNames).map((name) => (
              <IngredientChip
                key={name}
                name={name}
                isSelected={true}
                onChange={(selected) =>
                  handleIngredientToggle(group.id, name, selected)
                }
              />
            ))}
            {/* Show ungrouped ingredients (unselected) - clicking adds to this group */}
            {Array.from(ungrouped).map((name) => (
              <IngredientChip
                key={name}
                name={name}
                isSelected={false}
                onChange={(selected) =>
                  handleIngredientToggle(group.id, name, selected)
                }
              />
            ))}
          </div>
        </div>
      ))}

      {ungrouped.size > 0 && (
        <div className={styles.ungroupedSection}>
          <div className={styles.ungroupedHeader}>UNGROUPED:</div>
          <div className={styles.chips}>
            {Array.from(ungrouped).map((name) => (
              <span key={name} className={styles.ungroupedChip}>
                {name}
              </span>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateGroup}
            className={styles.createGroupButton}
          >
            <Plus size={14} />
            Create Group from Ungrouped
          </Button>
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleApply}>
          Apply Groups{groupsToCreate > 0 ? ` (${groupsToCreate})` : ''}
        </Button>
      </div>
    </div>
  );
}
