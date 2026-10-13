import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";
import { getDemoUser, hasDemoSession, setDemoSession } from "@/lib/demo-store";

export interface Account {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'user';
  createdAt: string;
}

export interface UserWithAccounts extends User {
  currentAccountId?: string | null;
  accounts?: Account[];
}

async function fetchUser(): Promise<UserWithAccounts | null> {
  if (!hasDemoSession()) return null;
  return {
    ...getDemoUser(),
    currentAccountId: "demo-account",
    accounts: [{ id: "demo-account", name: "VoucherFlow Demo", slug: "demo", role: "owner", createdAt: new Date().toISOString() }],
  };
}

async function logout(): Promise<void> {
  setDemoSession(false);
  window.location.href = '/';
}

async function switchAccount(_accountId: string): Promise<void> {
  return Promise.resolve();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery<UserWithAccounts | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  const switchAccountMutation = useMutation({
    mutationFn: switchAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries();
      window.location.reload();
    },
  });

  const currentAccount = user?.accounts?.find(a => a.id === user.currentAccountId);

  return {
    user,
    currentAccount,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
    switchAccount: switchAccountMutation.mutate,
    isSwitchingAccount: switchAccountMutation.isPending,
  };
}
