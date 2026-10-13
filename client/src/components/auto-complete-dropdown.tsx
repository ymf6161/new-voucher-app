import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AutoCompleteOption {
  id: string;
  label: string;
}

interface AutoCompleteDropdownProps {
  value: string;
  displayValue: string;
  options: AutoCompleteOption[];
  placeholder?: string;
  className?: string;
  onValueChange: (value: string, id: string) => void;
  onCreateNew?: (value: string) => Promise<void>;
  onBlur?: () => void;
  onAdvance?: () => void;
  inputRef?: (element: HTMLInputElement | null) => void;
  showNewBadge?: boolean;
}

export function AutoCompleteDropdown({
  value,
  displayValue,
  options,
  placeholder = "Type to search...",
  className,
  onValueChange,
  onCreateNew,
  onBlur,
  onAdvance,
  inputRef,
  showNewBadge = false,
}: AutoCompleteDropdownProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const localInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const getFilteredOptions = () => {
    if (!displayValue) return options.slice(0, 10);
    return options
      .filter((opt) =>
        opt?.label?.toLowerCase().includes(displayValue.toLowerCase())
      )
      .slice(0, 10);
  };

  const filteredOptions = getFilteredOptions();
  const hasExactMatch = filteredOptions.some(
    (opt) => opt?.label?.toLowerCase() === displayValue.toLowerCase()
  );
  const showCreateOption = onCreateNew && displayValue && !hasExactMatch;
  const totalOptions = filteredOptions.length + (showCreateOption ? 1 : 0);

  const handleSelect = (option: AutoCompleteOption) => {
    onValueChange(option.label, option.id);
    setShowDropdown(false);
    setHighlightedIndex(0);
    setIsTyping(false);
    onAdvance?.();
  };

  const handleCreateNew = async () => {
    if (!onCreateNew || !displayValue) return;
    await onCreateNew(displayValue);
    setShowDropdown(false);
    setHighlightedIndex(0);
    setIsTyping(false);
    onAdvance?.();
  };

  const handleFocus = () => {
    if (localInputRef.current) {
      localInputRef.current.select();
    }
  };

  const handleChange = (newValue: string) => {
    onValueChange(newValue, "");
    setIsTyping(true);
    if (newValue) {
      setShowDropdown(true);
      setHighlightedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setShowDropdown(false);
      if (localInputRef.current) {
        localInputRef.current.blur();
      }
      return;
    }

    if (!showDropdown || totalOptions === 0) {
      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        if (displayValue && value) {
          setShowDropdown(false);
          if (e.key === "Enter") {
            e.preventDefault();
          }
          if (onAdvance) {
            onAdvance();
          }
        }
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showCreateOption && highlightedIndex === filteredOptions.length) {
        handleCreateNew();
      } else {
        const selectedOption =
          filteredOptions[highlightedIndex] || filteredOptions[0];
        if (selectedOption) {
          handleSelect(selectedOption);
        }
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (showCreateOption && highlightedIndex === filteredOptions.length) {
        handleCreateNew();
      } else {
        const selectedOption =
          filteredOptions[highlightedIndex] || filteredOptions[0];
        if (selectedOption) {
          handleSelect(selectedOption);
        }
      }
    }
  };

  const handleBlurInternal = () => {
    setTimeout(() => {
      if (showDropdown && displayValue && !value) {
        const exactMatch = filteredOptions.find(
          (opt) => opt?.label?.toLowerCase() === displayValue.toLowerCase()
        );
        if (exactMatch) {
          onValueChange(exactMatch.label, exactMatch.id);
        } else if (onCreateNew) {
          void onCreateNew(displayValue);
        }
      }
      setShowDropdown(false);
      onBlur?.();
    }, 150);
  };

  useEffect(() => {
    if (inputRef && localInputRef.current) {
      inputRef(localInputRef.current);
    }
  }, [inputRef]);

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Input
          ref={localInputRef}
          className={cn(
            className,
            displayValue && !value && "border-yellow-500",
            showNewBadge && displayValue && "pr-14"
          )}
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlurInternal}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {showNewBadge && displayValue && (
          <Badge
            variant="outline"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-green-500/10 text-green-600 border-green-500/20 text-[10px] px-1.5 py-0 h-5 pointer-events-none"
          >
            NEW
          </Badge>
        )}
      </div>

      {showDropdown &&
        isTyping &&
        totalOptions > 0 &&
        localInputRef.current &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[99999] bg-popover border rounded-md shadow-lg max-h-60 overflow-auto"
            style={(() => {
              const rect = localInputRef.current!.getBoundingClientRect();
              const viewportHeight = window.innerHeight;
              const spaceBelow = viewportHeight - rect.bottom;
              const dropdownMaxHeight = 240;
              const showAbove = spaceBelow < dropdownMaxHeight;

              return {
                width: rect.width,
                left: rect.left,
                ...(showAbove
                  ? {
                      bottom: viewportHeight - rect.top + 4 + "px",
                    }
                  : {
                      top: rect.bottom + 2 + "px",
                    }),
              };
            })()}
          >
            {filteredOptions.map((option, idx) => (
              <div
                key={option.id}
                className={cn(
                  "px-3 py-2 cursor-pointer text-sm",
                  idx === highlightedIndex
                    ? "bg-accent font-medium"
                    : "hover:bg-accent"
                )}
                onMouseEnter={() => setHighlightedIndex(idx)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(option);
                }}
              >
                {option.label}
              </div>
            ))}
            {showCreateOption && (
              <div
                className={cn(
                  "px-3 py-2 cursor-pointer border-t text-sm flex items-center",
                  highlightedIndex === filteredOptions.length
                    ? "bg-accent font-medium"
                    : "hover:bg-accent"
                )}
                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleCreateNew();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add "{displayValue}"
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
