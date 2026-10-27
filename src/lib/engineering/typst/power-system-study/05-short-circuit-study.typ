// Short Circuit Study letter, then its SKM sections.
#import "style.typ": *

#contents()

= Purpose
A short circuit study aims to evaluate the electrical system's ability to handle fault currents safely and identify potential areas of concern such as overloaded equipment, inadequate conductor sizing, or insufficient protective device ratings. By analyzing fault currents and equipment ratings, the study provides information regarding if the electrical system can withstand fault conditions without causing damage or compromising safety.

= Methods
The computer program utilized for this study was SKM Power Tools for Windows Software from SKM Systems Analysis, Inc.

Data was gathered from single line drawings of the facility, first hand data gathering on-site, data gathered by an outside source and/or 1st person interviews with maintenance staff. This model is considered a “snap shot” of the facility distribution system and does not reflect any future modifications of the system after the issue date of this report. See the “Assumptions” section of this study for additional steps taken while modeling the facility.

= Computer Calculations
For the purpose of calculating short circuit current levels, the electrical distribution system is reduced to a network of positive (+), negative (-), and zero (0) sequence impedance elements (resistance (R) and reactance (X)) and power sources. Impedance elements consist of cables, busways, transformers, transmission lines, reactors, and motor and generator windings. Power sources are rotating motors, generators, and utility fault contributions. Each node of this impedance network is assigned a "bus" name corresponding to the equipment names as shown on the system one-line drawings. Using these bus names, the computer program locates and interconnects all impedance elements and power sources, thereby creating a model of the distribution system as it physically exists. The computer program must be provided with physical information about each device in the distribution system The input data is reduced to per unit values of positive (+), negative (-) and zero (0) sequence resistance and reactance, on a common MVA base, by using standard calculations and typical (or nameplate) impedance values. The variable impedance of the arc during an arcing fault can reduce the fault current magnitudes to those shown in the Arc Flash Data Table in this report. Refer to IEEE Red Book, IEEE/ANSI Std. 141-1993, pg. 113-114 for a discussion on arcing faults.

= Assumptions
During the course of calculating short circuit currents, various assumptions must be made when exact information is not available or when the use of exact information would not contribute to greater accuracy of the results. The SKM program utilizes a number of default values for calculations. These values are utilized unless specific data has been identified to vary from these default values. Assumptions made by #preparedby are as follows:

+ All equipment, devices, conduit, wiring, etc. were entered into the study as shown on the drawings from information supplied by others, and/or as designed.
+ Utility transformer data, such % impedance values were acquired from a name plate data. These values are within acceptable range for this type of systems.
+ Normally, the infinite bus approach is applied to the utility point(s) of service. If the utility has provided the calculated short circuit values for the point of service, these values will be used instead of the infinite bus approach and are considered to have a more accurate representation of the utility contribution.

= Short Circuit Components Calculated
+ 3-phase steady state symmetrical components
+ single-line-to-ground steady state symmetrical components

= Scenarios
The facility is fed by a single power connection with the utility and a generator as an emergency power source. As such, two scenarios were analyzed. Scenario 1 where the utility feeds the facility and scenario 2 where the generator feeds the facility. Both scenarios were used to evaluate equipment short-circuit current ratings.

= Conclusions & Recommendations
== Conclusions
During this analysis, no immediate deficiencies were identified with existing circuits, or any potential safety issues that required immediate review.

With the available short circuit fault current, each protective device can be assessed for their ability to handle the respective fault current. That is, it can be determined if the available short circuit current at each device exceeds the device ratings (overdutied). Based on the above results, the system equipment is determined to be properly rated to withstand the available short circuit fault currents.

== Recommendations
+ If an electrical preventative maintenance (EPM) program is not currently in place, it is recommended to establish one. Routine inspection and maintenance of electrical equipment is essential to ensure system reliability, identify potential issues, and maintain equipment such that it can safely interrupt currents within rated short-circuit withstand capabilities.
+ Per NFPA-70E, it is recommended the short circuit, protective device coordination, and arc flash hazard analysis be updated every time a significant modification is made to the electrical system and reviewed periodically, not to exceed 5 years, to account for any system changes that may impact the design of the facilities protective systems.

#attachment(
  "Utility Information",
  "/PDF/Utility Information.pdf",
  heading: [Information Provided by \ #utilityprovider],
)
#attachment("SKM Generated 3-Phase Short Circuit Report", "/PDF/Short Circuit SKM Report.pdf", landscape: true)
#attachment("SKM Generated Equipment Evaluation Report", "/PDF/Equipment Evaluation Report.pdf", landscape: true)
#attachment("Short Circuit Oneline(s)", "/PDF/Short Circuit Oneline.pdf", landscape: true)
