import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import Card, {
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { Textarea } from "../../../components/ui/Textarea";
import type {
  ExitSurveyAssignment,
  ExitSurveyQuestion,
  ExitSurveyResponse,
} from "./ExitSurveys";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  MessageSquare,
  CheckCircle,
  Loader2,
  AlertCircle,
  FileText,
  ExternalLink,
} from "lucide-react";

const ASSIGNMENTS_STORAGE_KEY = "hr_exit_survey_assignments";
const RESPONSES_STORAGE_KEY = "hr_exit_survey_responses";

export const PublicExitSurveyTake: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [assignment, setAssignment] = useState<ExitSurveyAssignment | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<
    Record<string, string | number | string[]>
  >({});

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    try {
      const raw = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
      const list: ExitSurveyAssignment[] = raw ? JSON.parse(raw) : [];
      const found = list.find((a) => a.token === token);
      if (!found) {
        setNotFound(true);
        setAssignment(null);
      } else {
        setAssignment(found);
        if (found.completed_at) {
          setAlreadyCompleted(true);
        } else {
          setAnswers(
            found.questions.reduce<Record<string, string | number | string[]>>(
              (acc, q) => {
                acc[q.id] =
                  q.type === "scale_1_5" || q.type === "scale_1_10"
                    ? ""
                    : q.type === "yes_no"
                      ? ""
                      : "";
                return acc;
              },
              {},
            ),
          );
        }
      }
    } catch (_) {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const setAnswer = (questionId: string, value: string | number | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    if (!assignment) return;
    const required = assignment.questions.filter((q) => q.required);
    for (const q of required) {
      const v = answers[q.id];
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
        alert(`Please answer: ${q.prompt}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const rawResponses = localStorage.getItem(RESPONSES_STORAGE_KEY);
      const responses: ExitSurveyResponse[] = rawResponses
        ? JSON.parse(rawResponses)
        : [];
      const responseId = `resp_${Date.now()}`;
      const newResponse: ExitSurveyResponse = {
        id: responseId,
        survey_id: assignment.survey_id,
        assignment_id: assignment.id,
        employee_id: assignment.employee_id,
        employee_name: assignment.employee_name,
        responses: { ...answers },
        submitted_at: new Date().toISOString(),
      };
      responses.push(newResponse);
      localStorage.setItem(RESPONSES_STORAGE_KEY, JSON.stringify(responses));

      const rawAssignments = localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
      const assignmentsList: ExitSurveyAssignment[] = rawAssignments
        ? JSON.parse(rawAssignments)
        : [];
      const updated = assignmentsList.map((a) =>
        a.token === token
          ? {
              ...a,
              completed_at: new Date().toISOString(),
              response_id: responseId,
            }
          : a,
      );
      localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(updated));
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-[#f26722]" />
          <div className="flex justify-center py-6">
            <LoadingSpinner size="md" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <AlertCircle className="h-12 w-12 text-amber-500" />
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Link invalid or expired
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                This survey link may have been used, expired, or is incorrect.
                If you believe this is an error, please contact HR.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (alreadyCompleted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Already completed
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                You have already submitted this exit survey. Thank you for your
                feedback.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Thank you
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Your responses have been submitted. We appreciate your feedback.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!assignment) return null;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[#f26722]">
              <MessageSquare className="h-6 w-6" />
              <CardTitle className="text-xl">
                {assignment.survey_name}
              </CardTitle>
            </div>
            {assignment.survey_description && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                {assignment.survey_description}
              </p>
            )}
            {assignment.is_optional && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                This survey is optional. You may skip any non-required
                questions.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {(assignment.attached_documents?.length ?? 0) > 0 && (
              <div className="rounded-none border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-4">
                <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#f26722]" />
                  Documents to review
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                  You may open and review these documents before or while
                  completing the survey.
                </p>
                <ul className="space-y-2">
                  {assignment.attached_documents!.map((doc, i) => (
                    <li key={i}>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-[#f26722] hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {doc.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assignment.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((q) => (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              ))}
            <div className="pt-4 flex justify-end">
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: ExitSurveyQuestion;
  value: string | number | string[] | undefined;
  onChange: (v: string | number | string[]) => void;
}) {
  const id = `q_${question.id}`;
  const required = question.required;

  if (question.type === "textarea") {
    return (
      <div>
        <label
          htmlFor={id}
          className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
        >
          {question.prompt}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <Textarea
          id={id}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your response"
          rows={4}
          className="w-full"
        />
      </div>
    );
  }

  if (question.type === "scale_1_5") {
    const n = typeof value === "number" ? value : undefined;
    return (
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {question.prompt}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => onChange(num)}
              className={`w-10 h-10 rounded-none border text-sm font-medium transition-colors ${
                n === num
                  ? "bg-[#f26722] text-white border-[#f26722]"
                  : "border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "scale_1_10") {
    const n = typeof value === "number" ? value : undefined;
    return (
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {question.prompt}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex gap-1 flex-wrap">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => onChange(num)}
              className={`w-9 h-9 rounded border text-xs font-medium transition-colors ${
                n === num
                  ? "bg-[#f26722] text-white border-[#f26722]"
                  : "border-neutral-300 dark:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (question.type === "yes_no") {
    const v = value as string | undefined;
    return (
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {question.prompt}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={id}
              checked={v === "yes"}
              onChange={() => onChange("yes")}
              className="text-[#f26722] focus:ring-[#f26722]"
            />
            <span className="text-sm">Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={id}
              checked={v === "no"}
              onChange={() => onChange("no")}
              className="text-[#f26722] focus:ring-[#f26722]"
            />
            <span className="text-sm">No</span>
          </label>
        </div>
      </div>
    );
  }

  if (question.type === "multiple_choice" && question.options?.length) {
    const v = value as string | undefined;
    return (
      <div>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
          {question.prompt}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <div className="space-y-2">
          {question.options.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={id}
                checked={v === opt}
                onChange={() => onChange(opt)}
                className="text-[#f26722] focus:ring-[#f26722]"
              />
              <span className="text-sm">{opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
      >
        {question.prompt}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Input
        id={id}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your response"
        className="w-full"
      />
    </div>
  );
}
