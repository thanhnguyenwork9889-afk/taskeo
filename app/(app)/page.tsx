import { ActivityCard } from "@/components/dashboard/activity-card";
import { Hero } from "@/components/dashboard/hero";
import { MyTasksCard } from "@/components/dashboard/my-tasks-card";
import { QuickAccess } from "@/components/dashboard/quick-access";
import { RecentDocsCard } from "@/components/dashboard/recent-docs-card";
import { SpacesCard } from "@/components/dashboard/spaces-card";
import { TodayCalendar } from "@/components/dashboard/today-calendar";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <Hero />
      <QuickAccess />
      <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.35fr)_minmax(0,1fr)]">
        <TodayCalendar />
        <MyTasksCard />
        <ActivityCard />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <RecentDocsCard />
        <SpacesCard />
      </div>
    </div>
  );
}
