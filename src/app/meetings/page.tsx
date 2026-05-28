import { Plane } from 'lucide-react';
import { Layout } from '@/components/ui/Layout';

export default function MeetingsPage() {
  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="flex flex-row items-center gap-3">
          <Plane className="h-10 w-10 shrink-0 fill-current" aria-hidden />
          <h1 className="text-xl font-bold text-black">Coming soon</h1>
        </div>
      </div>
    </Layout>
  );
}
