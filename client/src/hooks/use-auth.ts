import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { setAccountId } from "@/lib/supabase-api";
import type { User } from "@shared/schema";

export interface Account {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "user";
  createdAt: string;
}

export interface UserWithAccounts extends User {
  currentAccountId?: string | null;
  accounts?: Account[];
}

async function fetchSession(): Promise<UserWithAccounts | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const authUser = session.user;

  // Fetch the user profile row
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) return null;

  // Fetch accounts this user belongs to
  const { data: accountUsers } = await supabase
    .from("account_users")
    .select("account_id, role, accounts!inner(id, name, slug, created_at)")
    .eq("user_id", authUser.id);

  const accounts: Account[] = (accountUsers || []).map((au: any) => ({
    id: au.accounts.id,
    name: au.accounts.name,
    slug: au.accounts.slug,
    role: au.role,
    createdAt: au.accounts.created_at,
  }));

  const currentAccountId = profile.current_account_id || accounts[0]?.id || null;

  // Sync the account ID into the data layer
  setAccountId(currentAccountId);

  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    profileImageUrl: profile.profile_image_url,
    role: profile.role,
    created_at: profile.created_at,
    currentAccountId,
    accounts,
  };
}

async function logout(): Promise<void> {
  await supabase.auth.signOut();
  setAccountId(null);
  window.location.href = "/";
}

async function switchAccount(accountId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  await supabase
    .from("users")
    .update({ current_account_id: accountId })
    .eq("id", session.user.id);
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(true);

  const { data: user } = useQuery<UserWithAccounts | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchSession,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  // Listen for auth state changes to update loading state and refetch
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      (async () => {
        if (!session?.user) {
          setAccountId(null);
          queryClient.setQueryData(["/api/auth/user"], null);
        } else {
          await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }
        setIsLoading(false);
      })();
    });

    // If no auth state change fires immediately, check initial state
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
    },
  });

  const switchAccountMutation = useMutation({
    mutationFn: switchAccount,
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  const currentAccount = user?.accounts?.find((a) => a.id === user.currentAccountId);

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
