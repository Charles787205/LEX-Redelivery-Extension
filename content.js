// Lazada Logistics Auto-processor
// Monitors table for new rows and processes based on conditions
// Checks API status before processing

(function() {
  'use strict';

  console.log('Lazada Logistics Auto-processor loaded');

  // Reasons that trigger "No" action
  const TRIGGER_REASONS = [
    'Customer refuses delivery',
    'Customer cancelled orders before delivery'
  ];

  // Track processed rows to avoid duplicate processing
  const processedRows = new Set();
  const processingRows = new Set(); // Currently being processed
  let isProcessing = false;
  let checkTimeout = null;

  /**
   * Check if a reason matches trigger conditions
   */
  function shouldTriggerNoAction(reason, attempts) {
    const reasonLower = reason.toLowerCase();
    
    // Check if reason contains "refuse" or "cancelled"
    if (reasonLower.includes('refuse') || reasonLower.includes('cancelled')) {
      return true;
    }
    
    // Check if number of attempts is 2 or more
    if (attempts >= 2) {
      return true;
    }
    
    return false;
  }

  /**
   * Extract row data
   */
  function extractRowData(row) {
    const cells = row.querySelectorAll('td');
    console.log(`Row has ${cells.length} cells`);
    
    if (cells.length < 11) {
      console.log('Not enough cells in row');
      return null;
    }

    // Extract data from cells
    const trackingNumber = cells[0].textContent.trim();
    const reason = cells[6].textContent.trim();
    const attemptsText = cells[5].textContent.trim();
    const attempts = parseInt(attemptsText) || 0;

    console.log(`Extracted - Tracking: ${trackingNumber}, Reason: "${reason}", Attempts: ${attempts}`);

    // Find the Edit button - search through ALL buttons in the last cell
    const lastCellIndex = cells.length - 1;
    const actionCell = cells[lastCellIndex];
    let editButton = null;
    
    if (actionCell) {
      // Get ALL buttons in the action cell
      const buttons = actionCell.querySelectorAll('button');
      console.log(`Found ${buttons.length} button(s) in action cell`);
      
      buttons.forEach((button, btnIdx) => {
        const buttonText = button.textContent.trim();
        console.log(`Button ${btnIdx} text: "${buttonText}"`);
        
        // Check if this button contains "Edit"
        if (buttonText.includes('Edit')) {
          editButton = button;
          console.log('✅ Edit button found!');
        }
      });
    }

    return {
      trackingNumber,
      reason,
      attempts,
      editButton,
      row
    };
  }

  /**
   * Click the "No" radio button in the modal
   */
  function clickNoRadioButton() {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Find the radio group
        const radioGroup = document.querySelector('#dialogReattempt');
        if (!radioGroup) {
          console.log('Radio group not found');
          resolve(false);
          return;
        }

        // Find all radio wrapper labels
        const radioWrappers = radioGroup.querySelectorAll('.lazada-logistics-radio-wrapper');
        
        // The second radio wrapper is "No"
        if (radioWrappers.length >= 2) {
          const noRadioWrapper = radioWrappers[1];
          const noRadioInput = noRadioWrapper.querySelector('input[type="radio"]');
          
          if (noRadioInput) {
            console.log('Clicking "No" radio button');
            noRadioInput.click();
            
            // Also click the label for better compatibility
            noRadioWrapper.click();
            
            resolve(true);
          } else {
            console.log('No radio input not found');
            resolve(false);
          }
        } else {
          console.log('Not enough radio buttons found');
          resolve(false);
        }
      }, 500); // Wait for modal to render
    });
  }

  /**
   * Click the Submit button in the modal
   */
  function clickSubmitButton() {
    return new Promise((resolve) => {
      setTimeout(() => {
        // Find the modal footer
        const modalFooter = document.querySelector('.lazada-logistics-dialog-footer');
        if (!modalFooter) {
          console.log('Modal footer not found');
          resolve(false);
          return;
        }

        // Find the Submit button (primary button)
        const submitButton = modalFooter.querySelector('.lazada-logistics-btn-primary');
        if (submitButton) {
          console.log('Clicking Submit button');
          submitButton.click();
          resolve(true);
        } else {
          console.log('Submit button not found');
          resolve(false);
        }
      }, 300); // Wait a bit after clicking No
    });
  }

  /**
   * Process a row that meets the conditions
   */
  async function processRow(rowData) {
    if (isProcessing) {
      console.log('Already processing a row, skipping...');
      return;
    }

    isProcessing = true;
    console.log('Processing row:', rowData.trackingNumber);
    console.log('Reason:', rowData.reason);
    console.log('Attempts:', rowData.attempts);

    try {
      // Click the Edit button
      if (rowData.editButton) {
        console.log('Clicking Edit button');
        rowData.editButton.click();

        // Wait for modal to appear
        await new Promise(resolve => setTimeout(resolve, 500));

        // Click "No" radio button
        const noClicked = await clickNoRadioButton();
        if (!noClicked) {
          console.log('Failed to click No radio button');
          isProcessing = false;
          return;
        }

        // Click Submit button
        await clickSubmitButton();

        console.log('Row processed successfully');
        
        // Move from processing to processed
        processingRows.delete(rowData.trackingNumber);
        processedRows.add(rowData.trackingNumber);

        // Wait for modal to close and submit to complete before refocusing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Refocus the input field for next scan
        const input = document.querySelector('#trackingNumber');
        if (input) {
          input.focus();
          input.select();
          console.log('Input field refocused and ready for next scan');
        }
      }
    } catch (error) {
      console.error('Error processing row:', error);
      // Remove from processing on error
      processingRows.delete(rowData.trackingNumber);
    } finally {
      isProcessing = false;
    }
  }

  /**
   * Check for new rows in the table
   */
  function checkForNewRows() {
    // Debounce: clear any pending check
    if (checkTimeout) {
      clearTimeout(checkTimeout);
    }
    
    // Schedule the actual check
    checkTimeout = setTimeout(() => {
      performRowCheck();
      checkTimeout = null;
    }, 100);
  }

  /**
   * Perform the actual row check
   */
  function performRowCheck() {
    // Don't check if already processing
    if (isProcessing) {
      console.log('Already processing a row, skipping row check');
      return;
    }

    // Find all table bodies
    const tableBodies = document.querySelectorAll('.lazada-logistics-table-body tbody');
    console.log(`Found ${tableBodies.length} table(s) on page`);
    
    let foundRows = false;
    
    tableBodies.forEach((tableBody, tableIndex) => {
      const rows = tableBody.querySelectorAll('tr.lazada-logistics-table-row');
      console.log(`Table ${tableIndex}: Found ${rows.length} rows`);
      
      rows.forEach((row, rowIndex) => {
        const rowData = extractRowData(row);
        if (!rowData) {
          console.log(`Table ${tableIndex}, Row ${rowIndex}: Could not extract data`);
          return;
        }

        console.log(`Table ${tableIndex}, Row ${rowIndex}: ${rowData.trackingNumber}, Reason: "${rowData.reason}", Attempts: ${rowData.attempts}, Edit button found: ${!!rowData.editButton}`);

        // Skip if already processed
        if (processedRows.has(rowData.trackingNumber)) {
          console.log(`Table ${tableIndex}, Row ${rowIndex}: Already processed, skipping`);
          return;
        }

        // Skip if currently being processed
        if (processingRows.has(rowData.trackingNumber)) {
          console.log(`Table ${tableIndex}, Row ${rowIndex}: Currently being processed, skipping`);
          return;
        }

        // Check if conditions are met
        if (shouldTriggerNoAction(rowData.reason, rowData.attempts)) {
          console.log(`🎯 Trigger condition met for ${rowData.trackingNumber}`);
          console.log(`   Reason: ${rowData.reason}`);
          console.log(`   Attempts: ${rowData.attempts}`);
          
          if (rowData.editButton) {
            // Mark as being processed IMMEDIATELY
            processingRows.add(rowData.trackingNumber);
            foundRows = true;
            // Process this row
            processRow(rowData);
            // Exit early to prevent processing multiple rows at once
            return;
          } else {
            console.log(`❌ Edit button not found for ${rowData.trackingNumber}`);
          }
        } else {
          console.log(`Table ${tableIndex}, Row ${rowIndex}: Conditions not met (reason: "${rowData.reason}", attempts: ${rowData.attempts})`);
        }
      });
    });
    
    if (!foundRows) {
      console.log('No matching rows found in any table');
    }
  }

  /**
   * Monitor the input field for scanning
   */
  function monitorInputField() {
    const input = document.querySelector('#trackingNumber');
    if (!input) {
      console.log('Input field not found, retrying...');
      setTimeout(monitorInputField, 1000);
      return;
    }

    console.log('Input field found, monitoring for scans...');

    // Listen for Enter key (typical for barcode scanners)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        console.log('Scan detected (Enter pressed)');
        const scannedValue = input.value.trim();
        console.log('Scanned value:', scannedValue);
        
        // Just wait for the row to appear in the table
        setTimeout(checkForNewRows, 1500);
        setTimeout(checkForNewRows, 2500);
        setTimeout(checkForNewRows, 3500);
      }
    });

    // Monitor for any Check-in button clicks to detect when rows are added
    document.addEventListener('click', (e) => {
      const target = e.target;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        const button = target.tagName === 'BUTTON' ? target : target.closest('button');
        const buttonText = button.textContent.trim();
        
        // Only react to Check-in button clicks for monitoring
        if (buttonText === 'Check-in') {
          console.log('Check-in button clicked detected (monitoring only)');
          setTimeout(checkForNewRows, 1500);
          setTimeout(checkForNewRows, 2500);
        }
      }
    }, true); // Use capture phase to detect clicks without interfering

    // Also use MutationObserver to detect table changes
    observeTableChanges();
  }

  /**
   * Observe table for new rows using MutationObserver
   */
  function observeTableChanges() {
    const tableBody = document.querySelector('.lazada-logistics-table-body tbody');
    if (!tableBody) {
      setTimeout(observeTableChanges, 1000);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      let rowAdded = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeName === 'TR' && node.classList.contains('lazada-logistics-table-row')) {
              rowAdded = true;
            }
          });
        }
      });

      if (rowAdded) {
        console.log('New row detected in table');
        setTimeout(checkForNewRows, 500);
      }
    });

    observer.observe(tableBody, {
      childList: true,
      subtree: false
    });

    console.log('Table observer initialized');
  }

  // Initialize the extension
  function init() {
    console.log('Initializing Lazada Logistics Auto-processor...');
    
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', monitorInputField);
    } else {
      monitorInputField();
    }
  }

  // Start the extension
  init();
})();