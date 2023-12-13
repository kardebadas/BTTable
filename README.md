# BTTable Component
BTTable is a versatile React component designed for displaying tabular data with features such as sorting, searching, pagination, and column filtering. It provides a flexible and customizable table structure that can be easily integrated into your React application.

## Installation
```bash
npm install react react-dom react-datepicker
```

## Usage
```jsx
import React from 'react';
import BTTable from 'your-bttable-package-name';

const YourComponent = () => {
  // Define your data
  const rows = [
    // ... your data here
  ];

  // Define optional configurations
  const config = {
    // ... optional configurations here
  };

  return (
    <BTTable
      rows={rows}
      {...config}
    />
  );
};

export default YourComponent;
```

## Props

### `rows` (required)

An array of objects representing the data to be displayed in the table. Each object should contain properties corresponding to the columns.

### Optional Configuration Props

- `showTableHeader` (default: `true`): Show/hide the table header.
- `showCounter` (default: `false`): Show/hide the entry counter.
- `showPagination` (default: `false`): Show/hide pagination controls.
- `showClearButton` (default: `true`): Show/hide the clear filter button.
- `tableHeader` (default: `{}`): An object with column keys as keys and column names as values.
- `allowSearch` (default: `true`): Allow/disallow the search functionality.
- `rowLimit` (default: `100`): Number of rows to display per page.
- `fixedHeader` (default: `false`): Fix/unfix the table header.
- `tableClassName` (default: `''`): Additional class names for the table.
- `theadClassName` (default: `''`): Additional class names for the table header.
- `tbodyClassName` (default: `''`): Additional class names for the table body.
- `trClassName` (default: `''`): Additional class names for table rows.
- `filterableColumns` (default: `[]`): An array of objects defining filterable columns and their configurations.
- `callbackOnFilterChange` (default: `undefined`): A callback function triggered when filters change.

## Examples
### Basic Usage
```jsx
import React from 'react';
import BTTable from 'your-bttable-package-name';

const YourComponent = () => {
  const rows = [
    // ... your data here
  ];

  return (
    <BTTable rows={rows} />
  );
};

export default YourComponent;
```

### Custom Table Header
```jsx
import React from 'react';
import BTTable from 'your-bttable-package-name';

const YourComponent = () => {
  const rows = [
    // ... your data here
  ];

  const tableHeader = {
    'name': 'Name',
    'age': 'Age',
    'country': 'Country',
  };

  return (
    <BTTable rows={rows} tableHeader={tableHeader} />
  );
};

export default YourComponent;
```

### Custom Table Header with Filterable Columns
```jsx
import React from 'react';
import BTTable from 'your-bttable-package-name';

const YourComponent = () => {
  const rows = [
    // ... your data here
  ];

  const config = {
    showTableHeader: true,
    showCounter: true,
    showPagination: true,
    showClearButton: true,
    allowSearch: true,
    rowLimit: 50,
    fixedHeader: false,
    tableClassName: 'custom-table',
    theadClassName: 'custom-header',
    tbodyClassName: 'custom-body',
    trClassName: 'custom-row',
    filterableColumns: [
      btTableFilterObject({
        column: 'name',
        columnLabel: 'Name',
        filterType: 'string_select',
      }),
      btTableFilterObject({
        column: 'age',
        columnLabel: 'Age',
        filterType: 'number_text',
        dataType: 'number',
        matchMode: 'numerical_range',
      }),
    ],
    callbackOnFilterChange: (filteredRows, filterableColumns) => {
      // Handle filter change callback
    },
  };

  return (
    <BTTable rows={rows} {...config} />
  );
};

export default YourComponent;
```

### Advanced Filtering
The `BTTable` component supports advanced filtering with various filter types such as select dropdowns, date pickers, and numerical ranges. Configure the `filterableColumns` prop to enable advanced filtering for specific columns.
```jsx
const filterableColumns = [
  {
    column: 'name',
    columnLabel: 'Name',
    filterType: 'string_select',
  },
  {
    column: 'dateOfBirth',
    columnLabel: 'Date of Birth',
    filterType: 'datetime_text',
    dataType: 'date',
    matchMode: 'date_range',
  },
  {
    column: 'salary',
    columnLabel: 'Salary',
    filterType: 'number_text',
    dataType: 'number',
    matchMode: 'numerical_range',
  },
];

const YourComponent = () => {
  const rows = [
    // ... your data here
  ];

  return (
    <BTTable rows={rows} filterableColumns={filterableColumns} />
  );
};

```

### Customizing Rendering
```jsx
const rows = [
  {
    name: 'John Doe',
    age: 30,
    country: 'USA',
    Componet: {
      name: ({ value, row, col, index, onChange, onBlur, onClick, rowRef, colRef }) => (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          onClick={(e) => onClick(e, col, value, row, colRef, rowRef)}
        />
      ),
      age: MyCustomAgeComponent, // Your custom component
      country: 'Static Value', // Static value for this cell
    },
  },
];

const YourComponent = () => {
  return (
    <BTTable rows={rows} />
  );
};

```

For more details and updates, visit the [BTTable GitHub](https://github.com/kardebadas/BTTable) repository.

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT) - see the [LICENSE](LICENSE) file for details.

**Note:** This component is intended for personal or private use and is not licensed for commercial purposes.

