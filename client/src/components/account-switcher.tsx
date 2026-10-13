import { Check, ChevronsUpDown, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function AccountSwitcher() {
  const { user, currentAccount, switchAccount, isSwitchingAccount } = useAuth();

  if (!user || !user.accounts || user.accounts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between"
          disabled={isSwitchingAccount}
        >
          <div className="flex items-center gap-2 truncate">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-semibold">
              {currentAccount?.name.charAt(0).toUpperCase() || 'A'}
            </div>
            <span className="truncate">{currentAccount?.name || 'Select Account'}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]" align="start">
        <DropdownMenuLabel>My Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onSelect={() => {
              if (account.id !== currentAccount?.id) {
                switchAccount(account.id);
              }
            }}
            className="cursor-pointer"
          >
            <div className="flex items-center gap-2 flex-1">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                {account.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 truncate">
                <div className="font-medium truncate">{account.name}</div>
                <div className="text-xs text-muted-foreground capitalize">{account.role}</div>
              </div>
            </div>
            {currentAccount?.id === account.id && (
              <Check className="ml-2 h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer">
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
