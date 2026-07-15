import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Search,
  ChevronRight,
  ArrowUp,
  CheckCircle2,
  Circle,
  BookOpen,
  Download,
  Target,
  Users,
  ShieldCheck,
  Clock,
  Umbrella,
  CloudLightning,
  Wallet,
  GraduationCap,
  FileText,
  Scale,
  Beaker,
  Cigarette,
  Gavel,
  UserPlus,
  Heart,
  X,
} from "lucide-react";
import { toast } from "../../../components/ui/toast";
import { companyConfig } from "@/lib/companyConfig";

/* ------------------------------------------------------------------ */
/* Handbook content                                                    */
/* ------------------------------------------------------------------ */

interface SubSection {
  number?: string;
  title: string;
  /** Paragraphs and/or bullet lists */
  body: Array<string | { list: string[] }>;
}

interface Section {
  id: string;
  number: string;
  title: string;
  icon: React.ReactNode;
  subsections: SubSection[];
}

const CORE_VALUES: { title: string; desc: string }[] = [
  {
    title: "Attentiveness",
    desc: "Showing the worth of a person or task by giving our full, undivided attention.",
  },
  {
    title: "Commitment",
    desc: "Following through on our words, promises, pledges, and responsibilities with decisive action.",
  },
  {
    title: "Creativity",
    desc: "Approaching needs, tasks, and ideas with fresh thinking and new perspective.",
  },
  {
    title: "Dependability",
    desc: "Fulfilling what we agree to do, even when it requires unexpected sacrifice.",
  },
  {
    title: "Poise",
    desc: "Maintaining balance in mind, body (physical & financial), and spirit, while keeping our mission and higher purpose in daily focus.",
  },
  {
    title: "Diligence",
    desc: "Viewing each task as a meaningful assignment and applying our full effort to accomplish it with excellence.",
  },
  {
    title: "Integrity",
    desc: "Being whole and consistent in our moral and ethical principles in all circumstances.",
  },
];

const iconClass = "h-4 w-4";

const SECTIONS: Section[] = [
  {
    id: "welcome",
    number: "",
    title: "Welcome",
    icon: <BookOpen className={iconClass} />,
    subsections: [
      {
        title: "Mission",
        body: [
          "Committed to extraordinary quality, while exhibiting servant leadership, exceeding our clients' objectives of safety and reliability.",
        ],
      },
      {
        title: "Vision",
        body: [
          "To further the gospel while sustaining exceptional employment and providing quality services to the energy industry.",
        ],
      },
      {
        title: "About the Company",
        body: [
          "In 2009, Brian Rodgers felt called to step out in faith and start a new venture. With the support of his wife, he left his previous role and launched AMP, but the road wasn't easy. On his first day, he faced unexpected transitions, financial uncertainty, and even a car accident. Yet, within days, opportunities began to emerge.",
          "A former customer reached out, insisting on working with Brian directly. With no equipment and just one employee, AMP took on its first project, marking the start of our journey.",
          "In 2015, a downturn brought significant challenges, leaving Brian as the sole employee. However, through perseverance, careful planning, and the support of trusted advisors, AMP rebuilt stronger than ever.",
          "Today, AMP has grown into a thriving company with a dedicated team, guided by our commitment to faith, integrity, and service. At AMP, we believe that no matter the business, we're in the people business.",
        ],
      },
      {
        title: "CEO Welcome Letter",
        body: [
          "Dear New Employee,",
          "Welcome to AMP Quality Energy Services. We are pleased you have joined our team and hope you find your experience here both engaging and professionally rewarding.",
          "AMP Quality Energy Services was established as a corporation in the State of Alabama in May 2009. We encourage you to review our Company vision, purpose, and core values outlined in this handbook, as they guide how we work together and serve our clients.",
          "Your selection for employment reflects our belief that you have the skills and dedication necessary to contribute to our commitment to quality, safety, and reliability. In return, we strive to maintain a professional, respectful, and collaborative work environment.",
          "This Employee Handbook is designed to provide general information about Company policies, expectations, and procedures. While it addresses many common questions, it cannot anticipate every situation. Employees are encouraged to ask questions and raise concerns through appropriate channels when clarification is needed.",
          "We look forward to working with you and wish you success in your role at AMP Quality Energy Services. Welcome aboard.",
          "— Brian Rodgers, CEO",
        ],
      },
    ],
  },
  {
    id: "introduction",
    number: "1.0",
    title: "Introduction",
    icon: <FileText className={iconClass} />,
    subsections: [
      {
        number: "1.0",
        title: "Purpose and Scope",
        body: [
          "The purpose of this Employee Handbook is to provide general information regarding the policies, procedures, and expectations of AMP Quality Energy Services for all employees at all locations, including any subsidiaries.",
          "This Handbook is intended to supplement, but not replace, the Offer Letter or other written agreements provided to employees. In the event of a conflict between this Handbook and an individual Offer Letter or written employment agreement, the terms of the written agreement will govern.",
          "This Employee Handbook is not a contract of employment and does not create any express or implied agreement guaranteeing any specific terms or conditions of employment.",
          "Unless otherwise provided in a written agreement signed by the Chief Executive Officer (CEO), employment with AMP Quality Energy Services is at will and may be terminated by either the employee or the Company at any time, with or without cause or notice.",
        ],
      },
      {
        number: "1.1",
        title: "Omissions and Errors",
        body: [
          "This Handbook is intended to comply with all applicable federal, state, and local employment laws and regulations and may be modified or updated as necessary to maintain compliance. The Company reserves the right to correct any errors or omissions. Such corrections will not invalidate the Handbook as a whole and will not affect the continued enforceability of the remaining provisions.",
        ],
      },
      {
        number: "1.2",
        title: "At-Will Employment",
        body: [
          "AMP Quality Energy Services maintains an at-will employment relationship with its employees. This means that either the employee or the Company may terminate the employment relationship at any time, for any lawful reason, with or without cause or notice.",
          "While the Company may request advance notice of resignation when feasible, such notice is not required and does not alter the at-will nature of employment. Likewise, the Company is not obligated to provide advance notice prior to termination.",
          "All Company policies, practices, procedures, and benefits are subject to change at the Company's discretion, with or without notice, unless otherwise required by law.",
        ],
      },
    ],
  },
  {
    id: "eeo",
    number: "2.0",
    title: "Equal Employment Opportunity",
    icon: <Scale className={iconClass} />,
    subsections: [
      {
        number: "2.0",
        title: "Equal Employment Opportunity",
        body: [
          "AMP Quality Energy Services is an equal opportunity employer and is committed to providing a workplace free from unlawful discrimination. The Company does not discriminate against employees or applicants for employment on the basis of race, color, religion, creed, sex (including pregnancy, sexual orientation, gender identity, or gender expression), age, national origin, ancestry, disability, genetic information, veteran or military status, or any other status protected by applicable federal, state, or local law.",
          "This policy applies to all aspects of employment, including but not limited to recruitment, hiring, promotion, transfer, compensation, benefits, training, discipline, and termination.",
          "Employees who believe they have experienced or witnessed discrimination are encouraged to report the matter promptly to their supervisor, Human Resources, or another member of management. Reports will be reviewed promptly and handled as confidentially as possible.",
          "Retaliation against any individual who reports discrimination or participates in an investigation is strictly prohibited.",
        ],
      },
    ],
  },
  {
    id: "harassment",
    number: "3.0",
    title: "Anti-Harassment & Sexual Harassment",
    icon: <ShieldCheck className={iconClass} />,
    subsections: [
      {
        number: "3.0",
        title: "Anti-Harassment and Sexual Harassment",
        body: [
          "AMP Quality Energy Services is committed to maintaining a workplace free from harassment, including sexual harassment. Harassment is a form of misconduct that undermines the integrity of the employment relationship and will not be tolerated. Sexual harassment includes unwelcome conduct of a sexual nature, whether verbal, physical, or visual, when:",
          {
            list: [
              "Submission to such conduct is made a condition of employment;",
              "Submission to or rejection of such conduct is used as a basis for employment decisions; or",
              "Such conduct has the purpose or effect of unreasonably interfering with an individual's work performance or creating an intimidating, hostile, or offensive work environment.",
            ],
          },
          "Sexual harassment may include, but is not limited to, unwelcome sexual advances, inappropriate touching, requests for sexual favors, sexually suggestive comments, jokes, gestures, or displays.",
          "Employees who believe they have been subjected to harassment or who witness inappropriate conduct should report the matter promptly to their supervisor, Human Resources, or any member of management. Employees are not required to report concerns to a supervisor who is involved in the conduct.",
          "All complaints will be promptly investigated, and appropriate corrective action will be taken when warranted. Retaliation against any individual who reports harassment or participates in an investigation is strictly prohibited.",
        ],
      },
    ],
  },
  {
    id: "work-hours",
    number: "4.0",
    title: "Work Hours",
    icon: <Clock className={iconClass} />,
    subsections: [
      {
        number: "4.0",
        title: "Work Hours",
        body: [
          "Headquarters and Administrative Operations normal business hours are generally 7:30 a.m. to 4:00 p.m., Monday through Friday, with a 30-minute unpaid meal period. Meal periods should typically be taken between 11:00 a.m. and 1:00 p.m., unless business needs require a different schedule.",
          "Alternative or flexible work schedules may be approved in advance by the employee's supervisor and Human Resources, based on operational needs.",
        ],
      },
      {
        number: "4.1",
        title: "Breaks and Meal Periods",
        body: [
          "AMP Quality Energy Services may provide rest breaks and meal periods in accordance with business needs and applicable law. Short rest breaks, when provided, are paid and counted as hours worked. Meal periods are unpaid and employees must be fully relieved of duties during this time.",
          "Breaks are not guaranteed and may vary based on job duties, work location, and operational requirements.",
        ],
      },
      {
        number: "4.2",
        title: "Evenings, Weekends, and Additional Work Hours",
        body: [
          "Occasionally, business needs may require employees to work evenings, weekends, or additional hours beyond their regular schedule. Employees may be assigned such work based on operational needs.",
          "Non-exempt employees will be compensated for all hours worked in accordance with applicable wage and hour laws, including overtime pay when required. Exempt employees may be provided schedule flexibility or time off at management's discretion; however, such flexibility does not alter the exempt status of the position.",
          "All additional work hours must be approved in advance by the employee's supervisor unless an emergency or business necessity requires otherwise.",
        ],
      },
    ],
  },
  {
    id: "inclement-weather",
    number: "5.0",
    title: "Inclement Weather",
    icon: <CloudLightning className={iconClass} />,
    subsections: [
      {
        number: "5.0",
        title: "Inclement Weather",
        body: [
          "AMP Quality Energy Services intends to continue operations whenever possible; however, the Company recognizes that inclement weather conditions may occasionally affect employees' ability to travel safely to and from work. Employee safety is the Company's primary concern.",
          "The Company may delay opening, close operations, or modify work schedules due to inclement weather or other emergency conditions. Employees will be notified of operational changes through appropriate communication channels.",
          "Employees are expected to make reasonable efforts to report to work when conditions permit. If an employee believes that travel would present an unsafe condition, the employee must notify their supervisor as soon as possible.",
          "Pay treatment during inclement weather will be handled in accordance with applicable wage and hour laws:",
          {
            list: [
              "Non-exempt employees will be paid only for hours actually worked, unless applicable law requires otherwise. Missed time may be charged to available Paid Time Off (PTO) or unpaid.",
              "Exempt employees will be paid in accordance with salary basis requirements under applicable law. Use of PTO may be required where permitted.",
            ],
          },
          "Employees may be permitted to make up missed time with supervisor approval, based on operational needs. Unauthorized schedule changes are not permitted.",
        ],
      },
    ],
  },
  {
    id: "dress-code",
    number: "6.0",
    title: "Dress Code",
    icon: <Users className={iconClass} />,
    subsections: [
      {
        number: "6.0",
        title: "Dress Code",
        body: [
          "AMP Quality Energy Services expects employees to maintain a professional appearance appropriate to their role, work environment, and safety requirements. Dress and grooming standards are intended to promote safety, professionalism, and a positive Company image.",
          "The Company will make reasonable accommodations for sincerely held religious beliefs, medical conditions, disabilities, and other protected characteristics, in accordance with applicable law.",
        ],
      },
      {
        number: "6.1",
        title: "Office Employees",
        body: [
          "Office employees are expected to follow a business-casual dress standard. Examples include:",
          {
            list: [
              "Clean, professional pants or jeans without holes or tears",
              "Shirts appropriate for a professional environment (Company-issued or logo apparel encouraged)",
              "Closed-toe shoes",
              "Jewelry and accessories appropriate for the workplace",
            ],
          },
        ],
      },
      {
        number: "6.2",
        title: "Field Service Technicians",
        body: [
          "Field service technicians must comply with all safety and PPE requirements applicable to their job duties and work environment. Requirements may include:",
          {
            list: [
              "Company-issued or approved AMP shirts when interfacing with clients",
              "Steel or composite-toe safety footwear on job sites",
              "Flame-resistant (FR) pants and long-sleeve shirts when working near energized equipment or equipment that may become energized",
              "Natural fiber clothing as required by safety standards",
              "Eye protection, including side shields when wearing corrective lenses",
              "Additional PPE as required by job task, site conditions, or safety regulations",
            ],
          },
        ],
      },
      {
        number: "6.3",
        title: "Hair, Grooming, and Tattoos",
        body: [
          "Hair and grooming must not interfere with job performance or create a safety hazard. Where safety concerns exist, employees may be required to secure hair or use appropriate protective equipment.",
          "Visible tattoos must be free of offensive, discriminatory, or inappropriate content. Employees in client-facing roles may be required to cover tattoos when reasonably necessary for business or safety reasons.",
        ],
      },
      {
        number: "6.4",
        title: "Protective Clothing and Allowances",
        body: [
          "AMP Quality Energy Services will provide required FR pants and FR shirts to full-time field service employees at the beginning of employment at no cost. Thereafter, the Company will provide an annual clothing allowance for approved field service apparel, subject to Company guidelines.",
        ],
      },
    ],
  },
  {
    id: "personal-data",
    number: "7.0",
    title: "Personal Data",
    icon: <FileText className={iconClass} />,
    subsections: [
      {
        number: "7.0",
        title: "Personal Data",
        body: [
          "Employees are responsible for keeping their personal information accurate and up to date. Employees must notify their supervisor or Human Resources promptly of any changes to legal name, address, telephone number, emergency contact information, or other personal data necessary for payroll, benefits administration, or emergency response.",
        ],
      },
    ],
  },
  {
    id: "absences",
    number: "8.0",
    title: "Absences",
    icon: <Umbrella className={iconClass} />,
    subsections: [
      {
        number: "8.0",
        title: "Absences",
        body: [
          "AMP Quality Energy Services recognizes that employees may need to be absent from work from time to time. The Company provides various types of leave, including Paid Time Off (PTO), holidays, and bereavement leave, to help accommodate these needs.",
          "Leave without pay may be approved for Regular Full-Time (RFT) employees, when necessary, subject to supervisor approval and business needs, and in accordance with applicable law.",
          "Employee classification and eligibility for benefits are determined based on job status and hours worked. If an employee's work hours are reduced or regularly fall below the threshold required for RFT status, the Company may reclassify the employee as part-time.",
        ],
      },
      {
        number: "8.1",
        title: "Paid Time Off (PTO)",
        body: [
          "AMP Quality Energy Services provides Paid Time Off (PTO) to Regular Full-Time (RFT) employees for vacation, personal matters, or illness. With the exception of Company-observed holidays, PTO must be requested in advance and approved by the employee's supervisor, subject to operational needs.",
          "PTO Accrual — RFT employees accrue PTO based on length of service as follows unless otherwise stated in the employee's offer letter:",
          {
            list: [
              "Hire date through 3 years of service: 10 days per year",
              "More than 3 years through 5 years of service: 15 days per year",
              "More than 5 years of service: 20 days per year",
            ],
          },
          "PTO accrual begins on the employee's date of hire and is earned incrementally each pay period.",
          "Use of PTO:",
          {
            list: [
              "PTO is not considered hours worked for overtime calculation purposes.",
              "PTO may be used, with supervisor approval, to supplement scheduled work hours up to a maximum of 40 hours in a workweek.",
              "PTO must be taken in whole-hour increments unless otherwise approved.",
            ],
          },
          "Carryover and Accrual Limits — Employees may carry over a maximum of 15 days (120 hours) of unused PTO into the following year. Accrued PTO in excess of this limit will be forfeited.",
          "Negative PTO Balances — Negative PTO balances may be approved at management's discretion but may not exceed eight (8) hours and are not guaranteed.",
          "Separation from Employment — Employees who separate from employment will be paid accrued but unused PTO through the last completed pay period, in accordance with Company policy and applicable law.",
          "Part-Time Employees — Part-time employees are not eligible to accrue PTO.",
        ],
      },
      {
        number: "8.2",
        title: "Holidays",
        body: [
          "AMP Quality Energy Services observes the following paid holidays for Regular Full-Time (RFT) employees. Part-time employees are not eligible for paid holidays.",
          "Holidays falling on a Saturday will generally be observed on the preceding Friday. Holidays falling on a Sunday will generally be observed on the following Monday.",
          "Observed holidays include:",
          {
            list: [
              "New Year's Day",
              "Good Friday",
              "Memorial Day",
              "Independence Day",
              "Labor Day",
              "Thanksgiving Day",
              "Christmas Day",
            ],
          },
          "Holiday pay is provided at the employee's regular rate of pay and is not considered hours worked for overtime calculation purposes unless otherwise required by law.",
        ],
      },
      {
        number: "8.3",
        title: "Bereavement Leave",
        body: [
          "AMP Quality Energy Services provides bereavement leave to support Regular Full-Time (RFT) employees during the loss of a family member.",
          {
            list: [
              "RFT employees may receive up to three (3) paid days of bereavement leave upon the death of an immediate family member, defined as a spouse, child, parent, sibling, grandparent, or equivalent in-law relationship.",
              "RFT employees may receive one (1) paid day of bereavement leave for the death of a close family member, such as an aunt, uncle, or cousin, when the employee will be attending the funeral or memorial service.",
            ],
          },
          "Additional unpaid time off or use of available PTO may be approved at management's discretion.",
        ],
      },
      {
        number: "8.4",
        title: "Attendance",
        body: [
          "AMP Quality Energy Services recognizes that employee absences are sometimes unavoidable. However, regular and dependable attendance is an essential function of most positions and is necessary for the success of the Company.",
          "Employees are expected to minimize unscheduled absences and to follow established call-in and leave request procedures. Attendance concerns will be addressed on a case-by-case basis and may result in corrective action, up to and including termination of employment.",
          "Nothing in this policy alters the at-will nature of employment.",
        ],
      },
      {
        number: "8.5",
        title: "Parental Leave",
        body: [
          "AMP Quality Energy Services provides Parental Leave to eligible Regular Full-Time (RFT) employees to allow time to care for, bond with, and welcome a new child through birth or adoption.",
          "Eligible RFT employees may take up to six (6) weeks of Parental Leave. Of this time, two (2) weeks are paid and four (4) weeks are unpaid.",
          "During approved Parental Leave, employee benefits will continue in accordance with Company benefit plans and applicable law. Employees returning from approved Parental Leave will be reinstated in accordance with applicable law.",
        ],
      },
    ],
  },
  {
    id: "payroll",
    number: "9.0",
    title: "Payroll Schedule",
    icon: <Wallet className={iconClass} />,
    subsections: [
      {
        number: "9.0",
        title: "Payroll Schedule",
        body: [
          "All AMP Quality Energy Services employees are paid on a bi-weekly basis, every other Friday. Each workweek begins on Sunday and ends on Saturday. Pay is issued in accordance with applicable wage and hour laws.",
        ],
      },
      {
        number: "9.1",
        title: "Bonuses and Commissions",
        body: [
          "Bonuses and commissions, if offered, are governed by the terms of the applicable bonus or commission plan. Eligibility, amounts, and payment timing are determined by the Company in its sole discretion unless otherwise stated in a written plan or agreement.",
          "Bonuses may be awarded at the sole discretion of the CEO for reasons including, but not limited to, holiday recognition, company performance, or individual merit. Bonuses are not guaranteed and are not considered earned wages.",
          "Unless otherwise specified in a written plan, commissions are generally paid on a monthly basis, no later than thirty (30) days following the end of the month in which they are earned.",
          "Bonuses and commissions are not considered earned until all applicable conditions and requirements of the plan have been satisfied. Employees must be actively employed and in good standing at the time of payment unless otherwise stated in a written plan or agreement.",
        ],
      },
      {
        number: "9.2",
        title: "Overtime and Premium Pay",
        body: [
          "Only non-exempt (hourly) employees are eligible for overtime compensation. Exempt employees are not eligible for overtime or premium pay.",
          "For non-exempt employees, AMP Quality Energy Services complies with all applicable federal and state wage and hour laws. In addition, as part of its industry practice, the Company provides premium pay under the following circumstances:",
          "Employees will be paid one and one-half (1.5) times their regular rate of pay for:",
          {
            list: ["All hours worked in excess of eight (8) hours in a scheduled workday"],
          },
          "Employees will be paid two (2.0) times their regular rate of pay for:",
          {
            list: [
              "All hours worked in excess of twelve (12) hours in a scheduled workday, and",
              "All hours worked on Sundays and on Company-observed holidays, when approved or required by business needs.",
            ],
          },
          "These premium pay practices exceed minimum legal requirements and are provided at the Company's discretion. All overtime and premium work must be approved in advance by a Lead or Supervisor unless an emergency or safety issue requires immediate action.",
        ],
      },
      {
        number: "9.3",
        title: "Travel Time Compensation",
        body: [
          "Travel time will be compensated in accordance with applicable federal and state wage and hour laws. Non-exempt employees will be paid for compensable travel time as required by law.",
          "Exempt employees are not eligible for additional compensation for travel time.",
        ],
      },
      {
        number: "9.4",
        title: "Timekeeping",
        body: [
          "All non-exempt employees must accurately record all time worked using the Company-approved timekeeping system. Time must be recorded daily and submitted no later than 8:00 a.m. Central Time on the Monday following the end of the workweek.",
          "Employees are responsible for ensuring the accuracy of their time records. Falsification, misrepresentation, or repeated failure to accurately report time worked may result in corrective action, up to and including termination of employment.",
          "Employees will be paid for all hours worked in accordance with applicable law. Failure to submit timesheets timely may result in corrective action but will not result in withholding of earned wages.",
        ],
      },
      {
        number: "9.5",
        title: "Income Tax Withholding",
        body: [
          "Employees are responsible for completing and submitting all required federal, state, and local tax withholding forms, including Form W-4 and applicable state withholding forms.",
          "Changes to tax withholding must be submitted in writing using the appropriate forms. Verbal requests cannot be accepted. AMP Quality Energy Services will provide the necessary forms upon request.",
        ],
      },
      {
        number: "9.6",
        title: "Pay Rates and Increases",
        body: [
          "Employee pay rates are determined at the time of hire based on job responsibilities, qualifications, experience, and market considerations. Pay increases, if any, are discretionary and based on individual performance, business needs, and Company financial considerations. Pay increases are not guaranteed.",
        ],
      },
    ],
  },
  {
    id: "expense",
    number: "10.0",
    title: "Expense Reimbursement",
    icon: <Wallet className={iconClass} />,
    subsections: [
      {
        number: "10.0",
        title: "Expense Reimbursement",
        body: [
          "Certain positions at AMP Quality Energy Services require travel, including overnight or extended travel, to meet customer and operational needs. All Company-directed travel must be approved in advance by management unless exigent circumstances apply.",
          "Employees will be reimbursed for reasonable and necessary business expenses incurred on behalf of AMP Quality Energy Services, in accordance with Company guidelines. Expense reimbursement requests must be submitted promptly using the Company's approved expense report process and must include required documentation, such as receipts.",
          "Misuse or abuse of the expense reimbursement process may result in corrective action, up to and including termination of employment.",
        ],
      },
      {
        number: "10.1",
        title: "Per Diem Allowances",
        body: [
          "AMP Quality Energy Services provides per diem allowances to eligible employees traveling on Company business to help offset reasonable meal and incidental expenses.",
          {
            list: [
              "Per diem rates may be based on federal General Services Administration (GSA) per diem rates for the applicable travel location or a project-specific per diem rate established by the Company or customer.",
              "When a project-specific per diem rate applies, employees will be notified in advance of travel.",
              "Per diem eligibility and rates may vary by project, location, duration of travel, or customer requirements.",
              "Per diem is intended to cover meals and incidental expenses and is not considered wages for overtime calculation purposes when administered in accordance with applicable law.",
            ],
          },
        ],
      },
      {
        number: "10.2",
        title: "Travel Expenses and Reimbursement",
        body: [
          "AMP Quality Energy Services will reimburse employees for reasonable and necessary travel-related expenses incurred while performing approved Company business, in accordance with Company guidelines. Reimbursable expenses may include, but are not limited to:",
          {
            list: [
              "Mileage or fuel expenses for approved vehicle use",
              "Airfare, lodging, and ground transportation",
              "Parking, tolls, and other necessary travel costs",
              "Other job-related expenses approved in advance",
            ],
          },
          "Employees must submit expense reports with required documentation, such as receipts, in accordance with Company procedures. Expenses that are excessive, unauthorized, or not supported by documentation may not be reimbursed.",
        ],
      },
      {
        number: "10.3",
        title: "Use of Company Vehicles and Personal Vehicles",
        body: [
          "Employees using Company vehicles or personal vehicles for Company business must comply with all Company vehicle policies, maintain valid driver's licenses, and follow applicable safety requirements.",
          "Mileage reimbursement for personal vehicle use, when applicable, will be paid at a rate established by the Company, which may be based on the applicable IRS standard mileage rate or a Company-determined rate.",
        ],
      },
      {
        number: "10.4",
        title: "Compliance and Abuse",
        body: [
          "Misuse of per diem, travel privileges, or expense reimbursement may result in corrective action, up to and including termination of employment. The Company reserves the right to audit travel and expense submissions.",
        ],
      },
    ],
  },
  {
    id: "benefits",
    number: "11.0",
    title: "Benefits",
    icon: <Heart className={iconClass} />,
    subsections: [
      {
        number: "11.0",
        title: "Benefits",
        body: [
          "AMP Quality Energy Services offers a variety of benefits to eligible Regular Full-Time (RFT) employees. Certain benefits are subject to eligibility requirements and open enrollment periods, as defined by the applicable benefit plans.",
        ],
      },
      {
        number: "11.1",
        title: "Health Insurance",
        body: [
          "All Regular Full-Time (RFT) employees are eligible to enroll in AMP Quality Energy Services' benefit plans. Employees must complete the required enrollment forms to participate in voluntary benefits.",
          "Health insurance benefits are effective on the employee's date of hire. The Company pays 100% of the employee-only premium for the medical insurance plan and also provides employer-paid secondary (gap) coverage designed to reduce the employee's deductible and out-of-pocket exposure. Coverage elections for dependents are available at the employee's expense, subject to plan terms.",
          "Employees who decline coverage at the time of initial eligibility may enroll during the next annual open enrollment period or following a qualifying life event, in accordance with plan rules.",
        ],
      },
      {
        number: "11.2",
        title: "Life and Long-Term Disability Insurance",
        body: [
          "Eligible Regular Full-Time (RFT) employees are offered employer-sponsored life insurance and long-term disability coverage, subject to plan terms and eligibility requirements.",
        ],
      },
      {
        number: "11.3",
        title: "Voluntary Benefits",
        body: [
          "Optional benefit offerings include vision, dental, short-term disability, hospital indemnity, critical illness, and accident insurance. Participation is voluntary and subject to plan terms.",
          "Voluntary benefits become effective on the first day of the month following the employee's date of hire, unless otherwise specified by the applicable plan.",
        ],
      },
      {
        number: "11.4",
        title: "Retirement Program",
        body: [
          "Eligible RFT employees may elect to participate in the Company's SIMPLE IRA retirement plan, currently administered through Charles Schwab.",
          "AMP Quality Energy Services provides a matching contribution of up to three percent (3%) of eligible employee contributions, in accordance with the terms of the plan.",
        ],
      },
      {
        number: "11.5",
        title: "Plan Documents Govern",
        body: [
          "This summary is intended for informational purposes only. All benefits are governed by the official plan documents, insurance policies, and contracts, which control in the event of any conflict. The Company reserves the right to modify, amend, suspend, or terminate any benefit plan at any time, subject to applicable law.",
        ],
      },
    ],
  },
  {
    id: "professional-development",
    number: "12.0",
    title: "Professional Development",
    icon: <GraduationCap className={iconClass} />,
    subsections: [
      {
        number: "12.0",
        title: "Professional Development & Licensing Support",
        body: [
          "AMP Quality Energy Services is committed to maintaining a skilled and knowledgeable workforce and may provide training and professional development opportunities related to job duties, safety, and industry standards.",
          "Participation in required training is a condition of employment. Optional training opportunities may be offered based on role, performance, and business needs. Completion of training does not guarantee advancement, promotion, or increased compensation.",
          "Certain training costs may be reimbursed or covered by the Company subject to prior approval and applicable guidelines.",
        ],
      },
      {
        number: "12.1",
        title: "NETA Certification Sponsorship",
        body: [
          "The Company offers sponsorship opportunities for employees pursuing NETA certification, subject to role requirements and approval. Sponsorship terms, timelines, and reimbursement obligations are governed by the NETA Certification Policy.",
        ],
      },
      {
        number: "12.2",
        title: "CDL Reimbursement",
        body: [
          "The Company may reimburse eligible employees for costs associated with obtaining or maintaining a Commercial Driver's License (CDL), in accordance with the CDL Reimbursement Policy. Employees should refer to the applicable policy for eligibility requirements, reimbursement terms, and any service commitments.",
        ],
      },
      {
        number: "12.3",
        title: "Engineering Professional Licensing Sponsorship",
        body: [
          "Subject to business needs and prior written approval, the Company may sponsor eligible employees pursuing the Fundamentals of Engineering (FE) examination and/or Professional Engineer (PE) licensure. Sponsorship may include reimbursement of approved exam fees, study materials, and related application costs.",
          "Eligibility requirements, approval criteria, reimbursement limits, and any continued employment obligations will be outlined in a separate written agreement. Employees must obtain advance written approval before incurring reimbursable expenses.",
        ],
      },
    ],
  },
  {
    id: "job-descriptions",
    number: "13.0",
    title: "Job Descriptions",
    icon: <FileText className={iconClass} />,
    subsections: [
      {
        number: "13.0",
        title: "Job Descriptions",
        body: [
          "AMP Quality Energy Services maintains job descriptions for each position to outline general duties, responsibilities, qualifications, and physical requirements.",
          "Job descriptions are intended to describe the essential functions of a position but are not intended to be exhaustive. Duties, responsibilities, and assignments may change at any time based on business needs. Employees may be asked to perform additional tasks outside their job description when reasonably necessary.",
          "Nothing in a job description alters the at-will employment relationship or creates a contract of employment.",
        ],
      },
    ],
  },
  {
    id: "background-checks",
    number: "14.0",
    title: "Background Checks",
    icon: <ShieldCheck className={iconClass} />,
    subsections: [
      {
        number: "14.0",
        title: "Employment Background Checks",
        body: [
          "AMP Quality Energy Services conducts background checks on employees and applicants, as permitted by applicable law. Background checks may include, but are not limited to, criminal history, employment verification, education verification, driving records, and other job-related information.",
          "All background checks are conducted in compliance with applicable federal, state, and local laws, including the Fair Credit Reporting Act (FCRA) and any applicable state or local \"ban-the-box\" or fair chance laws.",
          "Certain positions may require ongoing or periodic background screenings to maintain eligibility for customer site access, badging, security clearances, or driving privileges. Employees assigned to customer projects must comply with all client-imposed screening, credentialing, and badging requirements.",
          "Failure to obtain or maintain required site access credentials may affect job assignments or continued employment, consistent with applicable law.",
        ],
      },
    ],
  },
  {
    id: "drug-alcohol",
    number: "15.0",
    title: "Drug & Alcohol Policy",
    icon: <Beaker className={iconClass} />,
    subsections: [
      {
        number: "15.0",
        title: "Drug and Alcohol Policy",
        body: [
          "AMP Quality Energy Services is committed to providing a safe, healthy, and productive work environment for employees, clients, and the public. To support this commitment, the Company maintains a drug- and alcohol-free workplace.",
          "The following conduct is prohibited and may result in corrective action, up to and including termination of employment:",
          {
            list: [
              "The use, possession, sale, distribution, or solicitation of illegal drugs, alcohol, or controlled substances on Company premises, customer premises, or while performing Company business.",
              "Reporting to work or performing Company duties while impaired by alcohol, illegal drugs, or the misuse of prescription or over-the-counter medications.",
              "The use or possession of prescription medication without a valid prescription issued to the employee.",
              "Off-duty use or possession of drugs or alcohol that adversely affects job performance, workplace safety, or the Company's legitimate business interests.",
            ],
          },
        ],
      },
      {
        number: "15.1",
        title: "Drug and Alcohol Testing",
        body: [
          "AMP Quality Energy Services may require drug and/or alcohol testing in accordance with applicable law under the following circumstances:",
          {
            list: [
              "Random Testing: Employees in safety-sensitive positions or positions where testing is job-related and consistent with business necessity may be subject to random drug and/or alcohol testing.",
              "Reasonable Suspicion (For-Cause) Testing: Testing may be required when there is a reasonable belief that an employee may be impaired, based on observable behavior, appearance, conduct, or performance issues.",
              "Post-Accident Testing: Employees involved in a work-related accident or safety incident that results in injury, property damage, or near-miss events may be required to submit to testing when impairment is reasonably suspected.",
            ],
          },
        ],
      },
      {
        number: "15.2",
        title: "Refusal to Test and Policy Violations",
        body: [
          "Refusal to submit to required testing or violation of this policy may result in corrective action, up to and including termination of employment. Employees will be given an opportunity to explain the circumstances prior to any final employment decision, where appropriate.",
        ],
      },
      {
        number: "15.3",
        title: "Prescription Medications",
        body: [
          "The lawful use of prescribed medications is permitted when taken as directed. Employees should notify Human Resources if a prescribed medication may affect their ability to perform job duties safely, so that appropriate accommodations or temporary job modifications can be evaluated. Medical information will be kept confidential in accordance with applicable law.",
        ],
      },
      {
        number: "15.4",
        title: "Fitness for Duty",
        body: [
          "Employees are expected to report to work fit for duty and able to perform their job responsibilities safely and effectively. The use, possession, distribution, or sale of illegal drugs or alcohol in the workplace, while on duty, or while operating Company vehicles or equipment is prohibited.",
        ],
      },
    ],
  },
  {
    id: "tobacco",
    number: "16.0",
    title: "Tobacco Policy",
    icon: <Cigarette className={iconClass} />,
    subsections: [
      {
        number: "16.0",
        title: "Tobacco",
        body: [
          "AMP Quality Energy Services maintains a tobacco-free workplace. The use of tobacco products, including cigarettes, smokeless tobacco, vaping devices, and similar products, is prohibited on Company premises, in Company vehicles, and on customer property.",
        ],
      },
    ],
  },
  {
    id: "code-of-conduct",
    number: "17.0",
    title: "Code of Conduct",
    icon: <Gavel className={iconClass} />,
    subsections: [
      {
        number: "17.0",
        title: "Code of Conduct",
        body: [
          "Employees are expected to conduct themselves in a professional, respectful, and cooperative manner in all work-related interactions. Courtesy, accountability, and appropriate communication are expected when dealing with coworkers, supervisors, customers, vendors, and members of the public.",
          "Employees are encouraged to ask questions and raise concerns in a respectful manner. AMP Quality Energy Services maintains an open-door approach and encourages employees to communicate concerns through appropriate management or Human Resources channels.",
        ],
      },
      {
        number: "17.1",
        title: "Theft & Dishonesty",
        body: [
          "The unauthorized removal, misuse, or theft of Company property or the property of others is strictly prohibited. Violations of this policy may result in corrective action, up to and including termination of employment. The Company reserves the right to refer matters to law enforcement when appropriate.",
        ],
      },
      {
        number: "17.2",
        title: "Workplace Violence",
        body: [
          "AMP Quality Energy Services maintains a zero-tolerance policy for workplace violence. Violence, threats, intimidation, or aggressive behavior toward employees, customers, or others is prohibited. Violations of this policy may result in corrective action, up to and including termination of employment.",
        ],
      },
      {
        number: "17.3",
        title: "Conflicts of Interest",
        body: [
          "Employees are expected to avoid situations in which personal interests conflict with the interests of AMP Quality Energy Services. Employees may not engage in outside business activities that compete with the Company or interfere with job performance, whether conducted on or off Company time.",
          "Employees may not use Company resources, equipment, or confidential information for personal business or gain. Potential conflicts of interest must be disclosed to management or Human Resources.",
        ],
      },
      {
        number: "17.4",
        title: "Workplace Communication Protocol",
        body: [
          "Employees are expected to address others in a professional and respectful manner. Within the Company, employees may use first names unless otherwise requested. When interacting with customers, vendors, or external parties, employees should use appropriate professional titles or preferred forms of address unless a first-name basis has been established.",
        ],
      },
      {
        number: "17.5",
        title: "Computers and Technology",
        body: [
          "Company-provided computers, systems, and electronic resources are Company property and are intended primarily for business use. Employees may not install unauthorized software, alter system settings, or bypass security controls without approval from management or Information Technology.",
          "Limited personal use may be permitted if it does not interfere with job duties, compromise security, or violate Company policy. Unauthorized use may result in corrective action.",
        ],
      },
      {
        number: "17.6",
        title: "Cell Phones",
        body: [
          "Company-issued mobile devices are Company property and must be used in accordance with Company policy. Personal cell phone use during work hours should be limited and must not interfere with job performance, safety, or customer service. Excessive or inappropriate use may result in corrective action.",
        ],
      },
      {
        number: "17.7",
        title: "Confidential and Proprietary Information",
        body: [
          "Employees may not disclose, use, or distribute confidential or proprietary Company information except as required to perform job duties or as authorized by the Company. This obligation continues after employment ends. Violations may result in corrective action, up to and including termination of employment.",
        ],
      },
      {
        number: "17.8",
        title: "Offboarding",
        body: [
          "Upon separation of employment, employees must return all Company property, including equipment, tools, identification badges, documents, and electronic devices. Final pay will be issued in accordance with applicable law.",
          "Employees remain obligated to comply with confidentiality, non-disclosure, and other post-employment obligations following separation.",
        ],
      },
    ],
  },
  {
    id: "referral-program",
    number: "18.0",
    title: "Employee Referral Program",
    icon: <UserPlus className={iconClass} />,
    subsections: [
      {
        number: "18.0",
        title: "Employee Referral Program",
        body: [
          "AMP Quality Energy Services maintains an Employee Referral Program to encourage employees to refer qualified candidates for open positions.",
          "Program details, including eligibility requirements, bonus amounts, and payment timing, are governed by the Company's Employee Referral Policy. Employees should refer to that policy for complete program guidelines and conditions.",
          "Referral bonuses will be paid in accordance with the terms of the Employee Referral Policy once all eligibility requirements and program conditions have been satisfied, including any applicable continued employment requirements.",
        ],
      },
    ],
  },
  {
    id: "code-of-ethics",
    number: "19.0",
    title: "Code of Ethics",
    icon: <Scale className={iconClass} />,
    subsections: [
      {
        number: "19.0",
        title: "Code of Ethics and Compliance Policy",
        body: [
          "AMP Quality Energy Services is committed to conducting business with integrity, professionalism, and accountability. All employees are expected to adhere to this Code of Ethics and to comply with Company policies, applicable laws, and ethical standards. Employees agree to the following principles:",
          {
            list: [
              "To act in the best interests of AMP Quality Energy Services and make business decisions consistent with Company vision, mission, values, policies, procedures, and governing documents.",
              "To avoid actual or perceived conflicts of interest whenever possible and to promptly disclose any potential conflicts to management or Human Resources.",
              "To maintain professional competence and perform job duties responsibly, safely, and in accordance with applicable standards.",
              "To treat all employees, clients, vendors, and partners fairly and respectfully, without discrimination or harassment.",
              "To support colleagues in maintaining ethical conduct and to promote a professional, respectful workplace.",
              "To raise questions or concerns regarding ethical conduct, compliance, or policy interpretation with a supervisor, Human Resources, or Company leadership.",
              "To protect Company confidential, proprietary, and trade secret information and not disclose, use, or distribute such information during or after employment except as authorized.",
              "To conduct all work-related activities honestly, responsibly, ethically, and lawfully.",
              "To avoid conduct that could harm the reputation, credibility, or effectiveness of AMP Quality Energy Services.",
            ],
          },
          "Violations of this Code of Ethics or Company policies may result in corrective action, up to and including termination of employment, consistent with Company policy and applicable law. Nothing in this Code alters the at-will nature of employment or creates a contract of employment.",
        ],
      },
      {
        number: "19.1",
        title: "Compliance and Acknowledgment",
        body: [
          "As a condition of employment, all AMP Quality Energy Services employees are required to comply with the policies and procedures outlined in this Employee Handbook.",
          "Employees must review, sign, and date the required acknowledgment and ethics statements provided by the Company. Signed acknowledgments will be maintained in the employee's personnel file. Failure to comply with Company policies may result in corrective action, up to and including termination of employment.",
        ],
      },
    ],
  },
];

const BRAND = "var(--brand)";

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const EmployeeHandbook: React.FC = () => {
  // Handbook text is AMP-specific legal content; buyer instances hide it
  // (VITE_COMPANY_SHOW_HR_HANDBOOK=false) until they supply their own.
  if (!companyConfig.showHrHandbook) {
    return (
      <div className="p-8 text-center text-neutral-600 dark:text-neutral-300">
        The employee handbook has not been set up for this company yet.
      </div>
    );
  }
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);
  const [showTop, setShowTop] = useState(false);
  const [ackReceived, setAckReceived] = useState(false);
  const [ackConditions, setAckConditions] = useState(false);
  const [ackViolations, setAckViolations] = useState(false);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Size the handbook frame to fill exactly the remaining viewport below the
  // app header so the panels scroll internally instead of the whole document.
  const [frameHeight, setFrameHeight] = useState<string>("calc(100vh - 4rem)");
  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setFrameHeight(`${Math.max(320, Math.floor(window.innerHeight - top))}px`);
    };
    measure();
    window.addEventListener("resize", measure);

    // Lock the document scroll while the handbook frame is mounted so the two
    // panels are the only scroll containers (no stray outer page scrollbar).
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    return () => {
      window.removeEventListener("resize", measure);
      html.style.overflow = prevOverflow;
    };
  }, []);

  // Persist acknowledgment locally so it survives navigation
  useEffect(() => {
    try {
      const saved = localStorage.getItem("handbook-ack-2026");
      if (saved) {
        const parsed = JSON.parse(saved);
        setAckReceived(!!parsed.received);
        setAckConditions(!!parsed.conditions);
        setAckViolations(!!parsed.violations);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persistAck = useCallback(
    (next: { received: boolean; conditions: boolean; violations: boolean }) => {
      try {
        localStorage.setItem("handbook-ack-2026", JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [],
  );

  // Filter sections by search query
  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((section) => {
      if (
        section.title.toLowerCase().includes(q) ||
        section.number.includes(q)
      )
        return true;
      return section.subsections.some((sub) => {
        if (sub.title.toLowerCase().includes(q)) return true;
        return sub.body.some((b) =>
          typeof b === "string"
            ? b.toLowerCase().includes(q)
            : b.list.some((i) => i.toLowerCase().includes(q)),
        );
      });
    });
  }, [query]);

  // Scroll spy — highlight the section currently in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filteredSections]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => setShowTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (!el || !container) return;
    // Scroll the content panel only — never the document — by computing the
    // section's position relative to the container's current scroll.
    const top =
      container.scrollTop +
      (el.getBoundingClientRect().top - container.getBoundingClientRect().top) -
      16;
    container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const allAcknowledged = ackReceived && ackConditions && ackViolations;

  const highlight = (text: string) => {
    const q = query.trim();
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#fde68a] text-inherit box-decoration-clone">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div
      ref={rootRef}
      className="flex flex-col -m-6 overflow-hidden"
      style={{ height: frameHeight }}
    >
      {/* Header banner */}
      <div
        className="flex items-center justify-between px-6 py-5 text-white print:hidden"
        style={{ backgroundColor: BRAND }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/15">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">
              Employee Handbook
            </h1>
            <p className="text-xs text-white/80">
              Revised February 2026
            </p>
          </div>
        </div>
        <a
          href={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documents/onboarding-documents/e-sign-forms/1772133131661_y166aion.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-xs font-medium hover:bg-white/25 transition-colors"
        >
          <Download className="h-5 w-5" />
        </a>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Table of contents */}
        <aside className="hidden md:flex w-72 flex-shrink-0 flex-col border-r border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150 print:hidden">
          <div className="p-3 border-b border-neutral-200 dark:border-dark-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the handbook…"
                className="w-full rounded-md border border-neutral-200 dark:border-dark-200 bg-neutral-50 dark:bg-dark-100 pl-8 pr-8 py-2 text-xs text-neutral-800 dark:text-dark-900 focus:outline-none focus:ring-2 focus:ring-brand/40"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          {!query && (
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <BookOpen className="h-3.5 w-3.5 text-brand" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-dark-500">
                Table of Contents
              </span>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredSections.length === 0 && (
              <p className="px-2 py-4 text-xs text-neutral-500">
                No sections match "{query}".
              </p>
            )}
            {filteredSections.map((section) => {
              const isActive = activeId === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-brand/10 text-brand font-semibold"
                      : "text-neutral-600 dark:text-dark-600 hover:bg-black/5 dark:hover:bg-dark-50"
                  }`}
                >
                  <span
                    className={
                      isActive ? "text-brand" : "text-neutral-400"
                    }
                  >
                    {section.icon}
                  </span>
                  <span className="flex-1 leading-tight">
                    {section.number && (
                      <span className="text-neutral-400 mr-1">
                        {section.number}
                      </span>
                    )}
                    {section.title}
                  </span>
                  <ChevronRight
                    className={`h-3 w-3 flex-shrink-0 ${
                      isActive ? "text-brand" : "text-transparent group-hover:text-neutral-400"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content */}
        <div
          ref={contentRef}
          className="relative flex-1 overflow-y-auto bg-neutral-50 dark:bg-dark-background"
        >
          <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
            {filteredSections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => (sectionRefs.current[section.id] = el)}
                className="scroll-mt-24 rounded-xl border border-neutral-200 dark:border-dark-200 bg-white dark:bg-dark-150 overflow-hidden shadow-sm"
              >
                <div className="flex items-center gap-3 border-b border-neutral-200 dark:border-dark-200 px-6 py-4">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white flex-shrink-0"
                    style={{ backgroundColor: BRAND }}
                  >
                    {section.icon}
                  </span>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                    {section.number && (
                      <span className="text-neutral-400 mr-2 font-semibold">
                        {section.number}
                      </span>
                    )}
                    {highlight(section.title)}
                  </h2>
                </div>

                <div className="px-6 py-5 space-y-6">
                  {section.subsections.map((sub, i) => (
                    <div key={i}>
                      <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-neutral-800 dark:text-dark-900">
                        {sub.number && (
                          <span className="text-brand font-bold">
                            {sub.number}
                          </span>
                        )}
                        {highlight(sub.title)}
                      </h3>
                      <div className="space-y-3">
                        {sub.body.map((block, j) =>
                          typeof block === "string" ? (
                            <p
                              key={j}
                              className="text-sm leading-relaxed text-neutral-600 dark:text-dark-600"
                            >
                              {highlight(block)}
                            </p>
                          ) : (
                            <ul
                              key={j}
                              className="ml-1 space-y-1.5 text-sm leading-relaxed text-neutral-600 dark:text-dark-600"
                            >
                              {block.list.map((item, k) => (
                                <li key={k} className="flex gap-2">
                                  <span
                                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                                    style={{ backgroundColor: BRAND }}
                                  />
                                  <span>{highlight(item)}</span>
                                </li>
                              ))}
                            </ul>
                          ),
                        )}
                      </div>

                      {/* Core values grid rendered inside the Welcome section */}
                      {section.id === "welcome" &&
                        sub.title === "CEO Welcome Letter" && (
                          <div className="mt-6">
                            <div className="mb-3 flex items-center gap-2">
                              <Target className="h-4 w-4 text-brand" />
                              <h3 className="text-sm font-semibold text-neutral-800 dark:text-dark-900">
                                AMP's 7 Core Values
                              </h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {CORE_VALUES.map((v) => (
                                <div
                                  key={v.title}
                                  className="rounded-lg border border-neutral-200 dark:border-dark-200 p-3"
                                >
                                  <div className="mb-1 flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-brand" />
                                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                                      {v.title}
                                    </span>
                                  </div>
                                  <p className="text-xs leading-relaxed text-neutral-500 dark:text-dark-500">
                                    {v.desc}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {/* Acknowledgment card — only when not filtering */}
            {!query && (
              <section
                id="acknowledgment"
                ref={(el) => (sectionRefs.current["acknowledgment"] = el)}
                className="scroll-mt-24 rounded-xl border-2 border-brand/40 bg-white dark:bg-dark-150 overflow-hidden shadow-sm"
              >
                <div className="flex items-center gap-3 px-6 py-4 border-b border-neutral-200 dark:border-dark-200">
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                    Employee Acknowledgment
                  </h2>
                </div>
                <div className="px-6 py-5 space-y-3">
                  {[
                    {
                      key: "received",
                      value: ackReceived,
                      set: setAckReceived,
                      label:
                        "I acknowledge that I have received and reviewed the AMP Quality Energy Services Employee Handbook and Code of Ethics.",
                    },
                    {
                      key: "conditions",
                      value: ackConditions,
                      set: setAckConditions,
                      label:
                        "I understand that compliance with Company policies is a condition of employment.",
                    },
                    {
                      key: "violations",
                      value: ackViolations,
                      set: setAckViolations,
                      label:
                        "I understand that violations of Company policies may result in corrective action, up to and including termination of employment.",
                    },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        const nextVal = !item.value;
                        item.set(nextVal);
                        persistAck({
                          received:
                            item.key === "received" ? nextVal : ackReceived,
                          conditions:
                            item.key === "conditions" ? nextVal : ackConditions,
                          violations:
                            item.key === "violations" ? nextVal : ackViolations,
                        });
                      }}
                      className="flex w-full items-start gap-3 rounded-lg border border-neutral-200 dark:border-dark-200 p-3 text-left hover:bg-neutral-50 dark:hover:bg-dark-100 transition-colors"
                    >
                      {item.value ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-brand" />
                      ) : (
                        <Circle className="mt-0.5 h-5 w-5 flex-shrink-0 text-neutral-300" />
                      )}
                      <span className="text-sm leading-relaxed text-neutral-700 dark:text-dark-700">
                        {item.label}
                      </span>
                    </button>
                  ))}

                  <button
                    disabled={!allAcknowledged}
                    onClick={() =>
                      toast({
                        title: "Acknowledgment recorded",
                        description:
                          "Thank you for reviewing the Employee Handbook.",
                      })
                    }
                    className="mt-2 w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: BRAND }}
                  >
                    {allAcknowledged
                      ? "Submit Acknowledgment"
                      : "Check all boxes to acknowledge"}
                  </button>
                </div>
              </section>
            )}

            <p className="pb-4 text-center text-xs text-neutral-400">
              This Handbook is not a contract of employment. Employment with AMP
              Quality Energy Services is at-will.
            </p>
          </div>

          {/* Back to top */}
          {showTop && (
            <button
              onClick={scrollToTop}
              className="absolute bottom-6 right-6 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition-transform hover:scale-105 print:hidden"
              style={{ backgroundColor: BRAND }}
              aria-label="Back to top"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeHandbook;
