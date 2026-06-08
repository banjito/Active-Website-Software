import { Layout } from '@/components/ui/Layout';

export default function MeetingsPage() {
  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-col items-center gap-6">
          <img
            src="/runway-animated.svg"
            alt="Runway"
            className="w-full max-w-[360px]"
          />
          <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Coming soon...</p>
        </div>
      </div>
    </Layout>
  );
}
