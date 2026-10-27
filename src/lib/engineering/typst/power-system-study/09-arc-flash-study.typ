// Arc Flash Study letter, then its SKM sections.
#import "style.typ": *

#contents()

= Purpose
The arc flash study aims to assess the potential for hazardous arc flash incidents and how to mitigate risks through proper protective measures and equipment. By analyzing the electrical system's parameters, such as fault currents and protective device settings, the study helps determine appropriate personal protective equipment (PPE) requirements and safe work practices for personnel working on or near energized equipment.

= Methods
The computer program utilized for this study was SKM Power Tools for Windows Software from SKM Systems Analysis, Inc.

Data was gathered from single line drawings of the facility, first hand data gathering on-site, data gathered by an outside source and/or 1st person interviews with maintenance staff. This model is considered a “snap shot” of the facility distribution system and does not reflect any future modifications of the system after the issue date of this report. See the “Assumptions” section of this study for additional steps taken while modeling the facility.

The calculation method used within the computer program is the industry’s preferred method of IEEE 1584-2018 Edition (NFPA 70E 2021 Annex D.4). All studies were done using standard practices recognized by IEEE, NFPA, and the NEC.

= Discussion
OSHA’s basic requirement is that work should not be done on exposed live parts above 50 volts. They do recognize that there are tasks encountered during construction, testing, and maintenance that do require work around or on exposed live parts. An arc flash hazard analysis identifies the arc flash hazard present when work has to be completed on or around exposed live parts.

Arc flash incident energy is typically measured in calories per square centimeter (cal/cm²) or joules per square centimeter (J/cm²). cal/cm² is the most commonly used unit in the U.S. and is used in NFPA 70E and IEEE 1584 standards. 1 cal/cm² ≈ 4.184 J/cm², which is the metric equivalent.

For reference, 1.2 cal/cm² is the threshold for a second-degree burn on human skin, and PPE (personal protective equipment) categories are based on these energy levels.

The three main factors that influence the incident energy of an arc flash are:
+ Energy: The available fault current at a particular system location
+ Time: How long it takes to clear a fault
+ Distance: Proximity to the fault, which is exponentially proportional to its intensity

Notice that voltage is not a contributing factor to arc flash incident energy. Arc flash PPE categories are independent of voltage. Arc flash PPE and electric shock PPE serve separate purposes and are both required when working on energized equipment.

Definitions per the 2021 NFPA 70E are listed below. These distance boundaries are important for personnel protection from arc flash hazards in addition to electrical shock hazards.
- Arc Flash Boundary: When an arc flash hazard exists \[systems 50 volts and greater\], an approach limit from the arc source at which incident energy equals 1.2 cal/cm².
- Limited Approach Boundary: An approach limit at a distance from an exposed energized electrical conductor or circuit part within which a shock hazard exists.
- Restricted Approach Boundary: An approach limit at a distance from an exposed energized electrical conductor or circuit part within which there is an increased likelihood of electric shock, due to electrical arc-over combined with inadvertent movement.

#figure(
  image("/Pictures/Arc Flash Boundaries.png", width: 60%),
  caption: [Approach Boundaries],
)

=== Two Second Rule
There can be conditions in the electrical configuration that would allow a fault condition to exist for several seconds. However, IEEE 1584 identifies that a maximum exposure time of 2 seconds can be utilized during arc flash hazard evaluation, if the affected personnel can get away from the arc in the event of an incident. This maximum time is utilized because there are consequences of an arc blast or human reflex reaction to an arc flash condition that would typically prevent longer exposure. As part of a fault condition, the blast pressure can be substantial enough to move a person across a room and out of the arc flash boundary. In addition to the blast pressure, reflex reaction will occur almost subconsciously making the person jump for safety and remove themselves from a dangerous situation. A greater maximum exposure time may also be used if circumstances exist that would hold individuals inside the arc flash protection boundary for a longer duration.

=== Impacts of Current levels on Arc Flash Hazards
The arc flash hazard at any one device is dependent upon a number of factors. These factors can vary at the device based upon the electrical source feeding the equipment at the time. Lower than normal utility contribution currents might be present during certain situations. This can be good, if the lower fault current is interrupted quickly. There are times that the lower fault current takes considerably longer time to clear, therefore the arc flash hazard at a device may be higher during periods of lower contribution currents in the system than it is with the normal operation. That is, the arc flash hazard at a panel board may be risk category 0 from the normal power source, but risk category 3 from the lower contribution current of the source. Arc flash labels always reflect the worst-case condition of all scenarios tested.

=== Managing and Minimizing Arc Flash Hazards
Obviously, there should be a goal to keep the arc flash hazard as low as possible. Most users have found the PPE requirements of incident energy exposures up to 12 cal/cm2 to be functional. There are other higher possible PPE categories (incident energy exposures greater than 12 cal/cm2 up to those identified at the “Dangerous” level for which no safe PPE exists) which require significantly more PPE, and there are other hazards associated with these levels of energy that most users want to avoid.

=== Personal Protective Equipment (PPE)
PPE shall provide protection from hazardous electrical conditions, shall be verified (tested) with regularity and by methods that are consistent with the exposure of employees to hazardous electrical conditions and shall include one or more of the following as determined by authorized management:

+ Shoes, boots, or overshoes for wet service
+ Gloves for wet service
+ Sleeves for wet service
+ Shoes for dry service
+ Gloves for dry service
+ Sleeves for dry service
+ Electrically insulated head protection
+ Protective clothing
+ Hearing Protection
+ Eye protection

Arc Flash PPE Class is based on calculations as defined in IEEE 1584 and definitions per NFPA 70E tables. The SKM program utilizes a table modeled after table 130.5(G) of 2021 NFPA 70E. The SKM table PPE levels are 0, 3, and 4 with level 0 being basic cotton clothing, level 3 being two or three layers of arc-rated clothing and level 4 being 3 of more layers of arc-rated clothing. Refer to table for incident energy levels associated with each PPE level. There is another possible category and that is any arc energy above the PPE category 4 level. This is identified as “Dangerous” in this report. No work should be done around live parts on equipment designated with a PPE Category of “Dangerous”.

=== Qualified and Non-qualified Individuals
Only qualified persons should be within the restricted, limited, & arc flash boundaries when there are exposed live parts. A qualified person is: “One who has demonstrated skills and knowledge related to the construction and operation of electrical equipment and installations and has received safety training to identify the hazards and reduce the associated risk” (2021 NFPA 70E). Non-qualified persons are only allowed within these boundaries when they are using the same level of PPE and under the supervision of a qualified person.
Whenever possible, de-energize equipment before working on or around electrical parts. This should be the highest priority. It should be noted that PPE is required to confirm that the electrical parts are de-energized.

*Whenever possible, de-energize equipment before working on or around electrical parts. This should be the highest priority. It should be noted that PPE is required to confirm that the electrical parts are de-energized.*

= Assumptions
During the course of performing an arc flash study, various assumptions must be made when exact information is not available or when the use of exact information would not contribute to greater accuracy of the results. The SKM program utilizes a number of default values for calculations. These values are utilized unless specific data has been identified to vary from these default values.

Assumptions made in this study are as follows:
- All equipment, devices, conduit, wiring, etc. were entered into the study as shown on the drawings from information supplied by others, and or first-hand visual verification.
- Normally, the infinite bus approach is applied to the utility point(s) of service. If the utility has provided the calculated short circuit values for the point of service, these values will be used instead of the infinite bus approach and are considered to have a more accurate representation of the utility contribution.
- A 5-second limit was implemented in this study, because there are no normal instances of service or maintenance in your systems that would hold an individual in the flash protection boundary longer than 5 seconds.

Some notable program default values are listed below:
- Low voltage default worker distance: 18”
- Low voltage default enclosure size: 14” x 12” x 8”
- Medium voltage default worker distance: 36”
- Medium voltage default enclosure size: 30” x 30” x 36”
- Altitude: 0ft
- Arc Flash Electrode Configuration default: VCB

= Findings
#ie-table()

Notes:
- Category 0 and Category 3 arc flash hazard levels are generally considered manageable and no corrective measures are typical taken for these hazard levels.
- Category 4 hazard levels are manageable but with significantly more PPE than Category 0 and 3 hazards. To reduce the Category 4 hazards in this electrical system additional equipment would be required.
- Areas identified as DANGEROUS – NO SAFE PPE EXISTS should not be worked on live. To reduce the DANGER hazards in this electrical system additional equipment would be required.
- Whenever possible, de-energize equipment before working on or around electrical parts. This should be the highest priority. It should be noted that PPE is required to confirm that the electrical parts are de-energized.

= Conclusions & Recommendations
As identified in the Arc Flash data tables and one-lines, there are no areas classified as dangerous (“Extreme Danger”).

The following items are needed in order to fully implement the #sitename arc flash hazard safety recommendations:
- In order to achieve the coordination and arc flash values as listed in this report, the protective devices must be set to the recommended settings and over-dutied protective devices (if applicable) must be replaced with those rated to withstand the available short circuit currents.
- Labels on equipment – All electrical equipment in the facility needs to have a label affixed which properly identifies PPE category, electrical hazard boundaries, voltage class and incident energy.
- Training and implementation – the usage of additional types of PPE and the implementation of increased safety work plans needs to be communicated throughout the facility. Maintenance work plans need to be further identified or reviewed to determine the safest implementation plan.
- PPE – Any work done on energized electrical conductors or circuit parts shall be executed while wearing designated personal protective equipment per the latest NFPA 70E standards. As a part of system implementation, personal protective equipment needs to be provided for the plant personnel. There are many options for clothing, including everyday work clothes, lab coats, coveralls, and switching coats/hoods, etc.
- There are some selective coordination issues that may affect the arc flash values.
- Per NFPA-70E, it is recommended the short circuit, protective device coordination, and arc flash hazard analysis be updated every time a significant modification is made to the electrical system and reviewed periodically, not to exceed 5 years, to account for any system changes that may impact the design of the facilities protective systems.

#section("Arc Flash PPE Table", landscape: true, logo-width: 35%, ppe-table())
#attachment("Arc Flash Results Table", "/PDF/Arc Flash Results Table.pdf", landscape: true)
#attachment("Arc Flash Oneline(s)", "/PDF/Arc Flash Oneline.pdf", landscape: true)
#attachment("Arc Flash Labels", "/PDF/Arc Flash Labels.pdf", landscape: true, bare: true)
