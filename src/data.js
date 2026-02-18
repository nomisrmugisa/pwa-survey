export const sections = [
  {
    id: "laundry",
    name: "Laundry Services",
    fields: [
      { id: "f1", label: "Are there adequate linen storage facilities?", type: "select", options: ["Yes", "No"] },
      { id: "f2", label: "Are there adequate supplies and washing detergents?", type: "select", options: ["Yes", "No"] }
    ]
  },
  {
    id: "personnel",
    name: "Personnel",
    fields: [
      { id: "p1", label: "Number of staff available", type: "number" }
    ]
  },
  {
    id: "supplies",
    name: "Supplies",
    fields: [
      { id: "s1", label: "Is there enough soap?", type: "select", options: ["Yes", "No"] }
    ]
  },
  {
    id: "wc",
    name: "Toilet Facilities",
    fields: [
      { id: "w1", label: "Are toilets clean?", type: "select", options: ["Yes", "No"] }
    ]
  }
];
