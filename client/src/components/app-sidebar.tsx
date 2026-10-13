import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Receipt,
  Send,
  Landmark,
  FileBarChart2,
  Building2,
  Users,
  Tag,
  CreditCard,
  Settings,
  Shield,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LogoMark } from "@/components/logo-mark";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AccountSwitcher } from "@/components/account-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";

const mainMenuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Receive Vouchers",
    url: "/vouchers",
    icon: Receipt,
  },
  {
    title: "Post Vouchers",
    url: "/batches",
    icon: Send,
  },
  {
    title: "Deposit Vouchers",
    url: "/deposits",
    icon: Landmark,
  },
  {
    title: "Reports",
    url: "/reports",
    icon: FileBarChart2,
  },
];

const settingsMenuItems = [
  {
    title: "Voucher Companies",
    url: "/settings/companies",
    icon: Building2,
  },
  {
    title: "Names",
    url: "/settings/names",
    icon: Users,
  },
  {
    title: "References",
    url: "/settings/references",
    icon: Tag,
  },
  {
    title: "Banks",
    url: "/settings/banks",
    icon: CreditCard,
  },
  {
    title: "Business Settings",
    url: "/settings/business",
    icon: Settings,
  },
  {
    title: "Users",
    url: "/settings/users",
    icon: Shield,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const getInitials = () => {
    const first = user?.firstName?.[0] || "";
    const last = user?.lastName?.[0] || "";
    return (first + last).toUpperCase() || user?.email?.[0]?.toUpperCase() || "U";
  };

  const getDisplayName = () => {
    if (user?.firstName || user?.lastName) {
      return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
    }
    return user?.email || "User";
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <LogoMark className="h-9 w-9 flex-none" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold" data-testid="text-app-name">VoucherFlow</span>
            <span className="text-xs text-muted-foreground">Voucher Management</span>
          </div>
        </div>
        <AccountSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || location.startsWith(item.url)}
                    data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={getDisplayName()} />
            <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" data-testid="text-user-name">{getDisplayName()}</p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-user-email">{user?.email}</p>
          </div>
          <Button variant="ghost" size="icon" title="Sign out" data-testid="button-logout" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
