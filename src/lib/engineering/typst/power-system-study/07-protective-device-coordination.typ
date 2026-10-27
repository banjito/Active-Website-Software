// Protective Device Coordination letter, then its SKM sections.
#import "style.typ": *

#contents()

= Purpose
A coordination study aims to optimize the protective device settings throughout the electrical distribution system to ensure selective and coordinated operation. This ensures that in the event of a fault, only the nearest protective device operates, minimizing downtime and maintaining power availability to critical loads. Although complete coordination of protective devices is desirable, it is not always possible due to system configuration, safety, or cost.

= Methods
The computer program utilized for this study was SKM Power Tools for Windows Software from SKM Systems Analysis, Inc.

Data was gathered from single line drawings of the facility, first hand data gathering on-site, data gathered by an outside source and/or 1st person interviews with maintenance staff. This model is considered a “snap shot” of the facility distribution system and does not reflect any future modifications of the system after the issue date of this report. See the “Assumptions” section of this study for additional steps taken while modeling the facility.

= Analysis
The operation of protective devices at different values of current can be predicted by use of a graphic representation of the time-current characteristics (TCC) of these devices. By plotting these characteristics on a common graph, the relationship between devices becomes apparent. Uncoordinated devices show up as overlapping characteristics or time intervals that may be too close between device characteristics. The device characteristic curves provided with this study were calculated and plotted using the above previously named computer program. Where possible, short circuit currents and ground fault currents are also used to accomplish proper coordination. The magnitude of fault current available will determine which region of the device characteristic curve to analyze under short circuit and overload conditions.

= Assumptions
During the course of evaluating the protective device coordination, various assumptions must be made when exact information is not available or when the use of exact information would not contribute to greater accuracy of the results. The SKM program utilizes a number of default values for calculations. These values are utilized unless specific data has been identified to vary from these default values. Assumptions made by #preparedby in the input data to the program are as follows:

+ Trip curves for protective device types provided in the computer program library are assumed to be correct.
+ All equipment, devices, etc. were entered into the study as shown on the drawings or in the model are from information supplied by others, witnessed first-hand, and/or as designed.
+ All protective device settings were calculated from the software analysis and do not indicate the current state of the facility. Field adjustments may be necessary to compensate for equipment tolerance.
+ Utility protective device settings have not been provided. It is assumed that the existing Utility service is properly coordinated with existing utility devices.

= General Protective Device Coordination Discussion
The coordination of protective devices such as breakers and fuses play a major role in the operational efficiency of a facility with the primary concerns being for personnel and equipment safety. Proper coordination ensures that a fault is localized and eliminated before major damage or injury can occur. The coordination study is an effort to determine the appropriate ampere ratings, types and settings for the overcurrent devices in an electrical system.

The procedure used in a coordination study to determine protective device settings is that of having protective devices nearest the fault trip first. Therefore, the upstream device is time delayed so that downstream devices have the opportunity to operate, while it then backs up the downstream devices if they fail to clear the fault.

All protective devices have published Time Current Curves (TCC’s) that show how a device can be selected to handle a fault situation. Using the TCC’s one can then appropriately coordinate the series of protective devices to ensure personnel and equipment safety. All devices have timing margins that must be taken into account for their proper operation in a fault condition, and their coordination with other devices. These margins differ from device to device and also are dependent on what type of device is protecting another. It is important to have all protective devices tested on a regular basis. The time-current curves used in this coordination study are the protective device’s published curves. If these units are not maintained properly, the devices may not operate as documented and may not coordinate.

The TCC’s include, if present and applicable, feeder breakers, main breakers, tie breakers, fuses, overcurrent relays, transformer damage curves, transformer inrush points, and short circuit currents at different voltage levels.

Considerations:
- It may be necessary to sacrifice protective device coordination to obtain a lower arc flash hazard rating at the equipment. To achieve a high level of coordination between protective devices, you must allow currents to exist on the system for a greater period of time to allow the furthest downstream protective device to clear the fault. To achieve the lowest possible incident energy, you must clear a short circuit as quickly as possible. As such, coordination and arc flash have a somewhat inverse relationship and a balance between the two must be achieved.
- Protective devices in series within the same feeder or branch circuit may not fully coordinate with one another. For example, a feeder circuit breaker in the main switchgear feeding an MCC that includes a main circuit breaker. If either one of these circuit breakers trip, the same portion of the electrical system (the MCC) will be interrupted. Since these circuit breakers are typically close in trip size ratings, it is difficult to achieve coordination.
- Though selective coordination is desirable in any system, it may not be feasible at the lowest voltage distribution panels.

== Low Voltage Coordination Nomenclature:
Circuit breakers, fuses and overcurrent relays are the most prevalent types of protective devices used in low voltage power systems. Each device has protection characteristics particular to that specific device. Many circuit breakers may have different variable settings available (Long Time (L), Short Time (S), Instantaneous (I) Ground Fault (G)) that can be easily modified for system changes; others have a fixed setting for specific areas or each area on the TCC (smaller breakers are usually of the fixed type). Fuses may have faster reaction times and are easily replaced should a problem or fault occur. Relays can be used in conjunction with larger breakers or as standalone devices, both cases having adjustable settings for proper coordination with downstream and upstream devices.

Circuit Breaker Settings Nomenclature:
- Long Time Pickup (LTPU) / Thermal: For electronic trip units, this sets the level of current at which the trip unit’s long time tripping function begins timing. For thermal overloads, this is the rated current value for which greater currents will cause the breaker to trip given the appropriate amount of time.
- Long Time Delay (LTD): This selects a predetermined amount of time that a sustained overload may be carried before the breaker trips. The higher the overload current the shorter time it is allowed to exist.
- Short Time Pickup (STPU): This sets the level of current at which the trip unit’s timing begins due to a short circuit condition (fault).
- Short Time Delay (STD): This establishes the amount of time that a short circuit may remain on the power circuit before the breaker trips. This is used to delay the breaker from tripping immediately to give the downstream overcurrent protective devices a chance to clear the electrical fault.
- Instantaneous (I) / Magnetic: This sets the level of current at which the breaker will trip without an intentional delay.
- Ground Fault Pickup (GFPU): This sets the level of current at which the trip unit’s timing begins due to a ground fault condition.
- Ground Fault Delay (GFD): This establishes the amount of time that a ground fault may remain on the power circuit before the breaker trips. This is used to delay the breaker from tripping immediately to give the downstream overcurrent protective devices a chance to clear the electrical fault.

= Conclusions & Recommendations
== Devices to be evaluated
Note that as of the completion of this study no devices were identified that require replacement for coordination purposes.

== Caution
The coordination curves provided depend on the device properly withstanding the available short circuit currents. Overdutied or unmaintained equipment will likely negatively impact the coordination of the system and may prevent the device from properly clearing the fault.

== Recommendations
+ The adjustable protective settings as shown in the TCCs are the recommended settings and not reflective of the current settings of these protective devices. In order to achieve the coordination and arc flash values as listed in this report, the protective devices must be set to the recommended settings.
+ It is recommended to establish a comprehensive electrical preventative maintenance (EPM) program if one is not already in place. Regular maintenance helps ensure the continued reliability and proper functioning of protective devices, reduces the risk of equipment failure, and supports the effectiveness of the coordination study over time.
+ Per NFPA-70E, it is recommended the short circuit, protective device coordination, and arc flash hazard analysis be updated every time a significant modification is made to the electrical system and reviewed periodically, not to exceed 5 years, to account for any system changes that may impact the design of the facilities protective systems.

#attachment("Input Data", "/PDF/Equipment Data.pdf", landscape: true)
#attachment("Time Current Curves (TCCs)", "/PDF/TCCs.pdf", landscape: true)
#attachment("Input Data Oneline(s)", "/PDF/Equipment Data Oneline.pdf", landscape: true)
