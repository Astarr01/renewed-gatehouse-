// Enhanced Report Generation Module
const REPORT_PASSWORD = "gatehouse";
const DB_NAME = "permitDB";
const DB_VERSION = 2;
const STORE_NAME = "permits";

// Database initialization with proper schema setup
async function initializeDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { 
                    keyPath: "id",
                    autoIncrement: true
                });
                // Create indexes for efficient querying
                store.createIndex("issueDate", "issueDate", { unique: false });
                store.createIndex("expireDate", "expireDate", { unique: false });
                store.createIndex("unitNumber", "unitNumber", { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Database initialization failed");
    });
}

// Password validation with secure comparison
async function validatePassword(input) {
    const encoder = new TextEncoder();
    const inputBuffer = encoder.encode(input);
    const storedBuffer = encoder.encode(REPORT_PASSWORD);
    
    if (inputBuffer.length !== storedBuffer.length) return false;
    return crypto.subtle.timingSafeEqual(inputBuffer, storedBuffer);
}

// Enhanced date validation
function isValidMonthYear(input) {
    const regex = /^(0[1-9]|1[0-2])\/(20[2-9]\d|2100)$/;
    if (!regex.test(input)) return false;
    
    const [month, year] = input.split('/').map(Number);
    const currentDate = new Date();
    const inputDate = new Date(year, month - 1);
    
    return inputDate <= new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
}

// Professional PDF generation with jspdf-autotable
function generateProfessionalPDF(data, month, year) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();
    const monthNames = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[month - 1];

    // Add cover page
    pdf.setFillColor(240, 240, 240);
    pdf.rect(0, 0, pdf.internal.pageSize.width, pdf.internal.pageSize.height, 'F');
    pdf.setFontSize(28);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(40, 60, 80);
    pdf.text("Monthly Access Report", 105, 50, { align: "center" });
    pdf.setFontSize(18);
    pdf.text(`${monthName} ${year}`, 105, 70, { align: "center" });
    pdf.addImage(document.getElementById('logo'), 'PNG', 75, 100, 60, 60);
    pdf.setFontSize(12);
    pdf.setTextColor(100);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    })}`, 105, 190, { align: "center" });

    // Add summary page
    pdf.addPage();
    const summaryData = calculateSummary(data);
    
    // Summary table
    pdf.setFontSize(16);
    pdf.setTextColor(40, 60, 80);
    pdf.text("Report Summary", 20, 20);
    pdf.autoTable({
        startY: 25,
        head: [['Metric', 'Value']],
        body: Object.entries(summaryData),
        theme: 'grid',
        styles: { fontSize: 12, cellPadding: 3 },
        headStyles: { fillColor: [40, 60, 80], textColor: 255 }
    });

    // Detailed data tables
    Object.entries(data).forEach(([unit, permits]) => {
        pdf.addPage();
        pdf.setFontSize(16);
        pdf.text(`Unit ${unit} Details`, 20, 20);
        
        const tableData = permits.map(permit => [
            permit.licensePlateNo,
            permit.visitorName,
            permit.officerName,
            new Date(permit.issueDate).toLocaleDateString('en-US'),
            new Date(permit.expireDate).toLocaleDateString('en-US'),
            permit.status || 'Active'
        ]);

        pdf.autoTable({
            startY: 25,
            columns: [
                { header: 'License Plate', dataKey: 'licensePlateNo' },
                { header: 'Visitor Name', dataKey: 'visitorName' },
                { header: 'Officer', dataKey: 'officerName' },
                { header: 'Issued', dataKey: 'issueDate' },
                { header: 'Expires', dataKey: 'expireDate' },
                { header: 'Status', dataKey: 'status' }
            ],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 10, cellPadding: 2 },
            headStyles: { fillColor: [70, 90, 110], textColor: 255 },
            alternateRowStyles: { fillColor: [240, 240, 240] },
            margin: { horizontal: 10 },
            tableWidth: 'wrap'
        });
    });

    // Add footer to all pages
    const pageCount = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(`Page ${i} of ${pageCount}`, 105, 285, { align: "center" });
        pdf.text("Confidential - Gatehouse Management System", 105, 290, { align: "center" });
    }

    pdf.save(`Gatehouse_Report_${monthName}_${year}.pdf`);
}

// Data processing functions
function calculateSummary(data) {
    let totalPermits = 0;
    const statusCounts = { Active: 0, Expired: 0 };
    const units = Object.keys(data).length;

    Object.values(data).forEach(permits => {
        totalPermits += permits.length;
        permits.forEach(permit => {
            const status = new Date(permit.expireDate) < new Date() ? 'Expired' : 'Active';
            statusCounts[status]++;
        });
    });

    return {
        'Reporting Period': `${monthName} ${year}`,
        'Total Units': units.toString(),
        'Total Permits': totalPermits.toString(),
        'Active Permits': statusCounts.Active.toString(),
        'Expired Permits': statusCounts.Expired.toString(),
        'Generated Date': new Date().toLocaleDateString()
    };
}

// Enhanced database query with date range
async function queryPermits(month, year) {
    const db = await initializeDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('issueDate');
        
        // Calculate date range
        const startDate = new Date(year, month - 1);
        const endDate = new Date(year, month);
        
        const range = IDBKeyRange.bound(
            startDate.getTime(),
            endDate.getTime(),
            false,
            true
        );

        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject("Query failed");
    });
}

// Main report generation flow
async function generateMonthlyReport(month, year) {
    try {
        const permits = await queryPermits(month, year);
        
        if (!permits.length) {
            alert("No permits found for the selected period");
            return;
        }

        const processedData = processReportData(permits);
        generateProfessionalPDF(processedData, month, year);
    } catch (error) {
        alert(`Report generation failed: ${error}`);
        console.error(error);
    }
}

// Event listener with improved UX
document.getElementById("generate-report-button").addEventListener("click", async () => {
    try {
        const password = prompt("Enter report generation password:");
        if (!await validatePassword(password)) {
            alert("Invalid credentials");
            return;
        }

        const monthYear = prompt("Enter reporting period (MM/YYYY):");
        if (!monthYear || !isValidMonthYear(monthYear)) {
            alert("Invalid date format. Use MM/YYYY (e.g., 03/2024)");
            return;
        }

        const [month, year] = monthYear.split('/').map(Number);
        await generateMonthlyReport(month, year);
    } catch (error) {
        alert("Operation failed: " + error.message);
    }
});