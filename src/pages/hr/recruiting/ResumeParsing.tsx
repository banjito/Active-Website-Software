import React from "react";
import Card, {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { FileText, Upload } from "lucide-react";
import { Button } from "../../../components/ui/Button";

export const ResumeParsing: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white">
            Resume Parsing
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">
            Auto-capture applicant data from resumes
          </p>
        </div>
        <Button className="bg-[#f26722] hover:bg-[#f26722]/90 text-white">
          <Upload className="mr-2 h-4 w-4" />
          Upload Resume
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-neutral-400" />
            <h3 className="mt-4 text-lg font-medium text-neutral-900 dark:text-white">
              Resume Parsing
            </h3>
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              Automated resume parsing and data extraction features coming soon
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
