/*
 pdfUtils.js

 Copyright (c) 2015, John Snyders

 ClimbingComp is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 ClimbingComp is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License
 along with ClimbingComp.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint node: true, strict: false */
var util = require("util");

/*
 https://github.com/devongovett/pdfkit/issues/351
 
 # Measure the text
 width = doc.widthOfString('This is a link!')
 height = doc.currentLineHeight()   
 */

var TOP = 0,
    RIGHT = 1,
    BOTTOM = 2,
    LEFT = 3;

function normalizeBoxValues(a) {
    var len;
    if (!util.isArray(a)) {
        a = [a];
    }
    len = a.length;
    if (len === 1) {
        a[1] = a[0];
        a[2] = a[0];
        a[3] = a[0];
    } else if (len === 2) {
        a[2] = a[0];
        a[3] = a[1];
    } else if (len === 3) {
        a[3] = a[1];
    }
    a.length = 4;
    return a;
}

module.exports = {

    /*
     * 
     * Columns: array of:
     *   prop: <string> name of property in data row
     *   label: <string> label to use column heading
     *   width: <points>
     *   color: <color>
     *   fill: <color>
     *   align: left | center | right | justify
     *   headerAlign: left | center | right | justify
     *   format: function(value, row, rowIndex, columnIndex)
     * Options:
     *   stripe: [{fill: <color>, color: <color>},...]
     *   breakOn: function(row)
     *   breakAction: function(row)
     *   nullValue: <string>
     *   cellPaddingX: <points>
     *   cellPaddingY: <points>
     *   cellFont: <string>
     *   cellFontSize: <n>
     *   headerAlign: left | center | right | justify
     *   headerFont: <string>
     *   headerFontSize: <n>
     *   headerColor: <color>
     *   headerFill: <color>
     *   tableWidth: <points> defaults to page width - right margins - tableX
     *   tableBorderWidth: []
     *   headerBorderWidth: []
     *   cellBorderWidth: []
     *   
     */
    printTable: function(doc, columns, data, tableX, tableY, options) {
        var i, j, col, x, y, w, row, value, available, tw, colWidths, br, lastBreak, cellH, headerH, curStripe,
            cellColor, cellFill,
            cellPaddingX = options.cellPaddingX || 8,
            cellPaddingY = options.cellPaddingY || 4,
            cellFont = options.cellFont || "Helvetica",
            headerFont = options.headerFont || "Helvetica-Bold",
            cellFontSize = options.cellFontSize || 10,
            headerFontSize = options.headerFontSize || 12,
            tableBorderWidth = normalizeBoxValues(options.tableBorderWidth || 1),
            headerBorderWidth = normalizeBoxValues(options.headerBorderWidth || [0, 1, 2, 0]),
            cellBorderWidth = normalizeBoxValues(options.cellBorderWidth || [1, 1]),
            borderColor = options.borderColor || "#000",
            headerFill = options.headerFill || "#eee",
            headerColor = options.headerColor || "#000",
            tableLeft = tableX,
            rowTop = tableY,
            tableWidth = options.tableWidth || (doc.page.width - tableLeft - doc.page.margins.right);

        function rowBorders(height, pos, color, fill) {
            var bw;
            doc.save();
            if (fill) {
                doc.fillColor(fill)
                    .rect(x, y, tableWidth, height)
                    .fill();
            }
            doc.strokeColor(color);
            if (pos === "header") {
                bw = tableBorderWidth[TOP];
            } else if (pos === "first") {
                bw = headerBorderWidth[BOTTOM];
            } else {
                bw = cellBorderWidth[TOP];
            }
            if (bw > 0) {
                doc.lineWidth(bw)
                    .moveTo(x, y)
                    .lineTo(x + tableWidth, y)
                    .stroke();
            }

            for (j = 0; j < columns.length + 1; j++) {
                col = columns[j];
                w = colWidths[j];
                if (pos !== "header" && col && col.fill) {
                    doc.fillColor(col.fill)
                        .rect(x, y, (2 * cellPaddingX) + w, height)
                        .fill();
                }
                if (j === 0) {
                    bw = tableBorderWidth[LEFT];
                } else if (j === columns.length) {
                    bw = tableBorderWidth[RIGHT];
                } else if (pos === "header") {
                    bw = headerBorderWidth[RIGHT];
                } else {
                    bw = cellBorderWidth[RIGHT];
                }
                if (bw > 0) {
                    doc.lineWidth(bw)
                        .moveTo(x, y)
                        .lineTo(x, y + height)
                        .stroke();
                }
                x += 2 * cellPaddingX + w;
            }
            doc.restore();
        }

        function rowBottomBorders(pos, color) {
            var bw;
            doc.save();

            doc.strokeColor(color);
            if (pos === "header") {
                bw = headerBorderWidth[BOTTOM];
            } else if (pos === "last") {
                bw = tableBorderWidth[BOTTOM];
            } else {
                bw = 0;
            }
            if (bw > 0) {
                doc.lineWidth(bw)
                    .moveTo(x, y)
                    .lineTo(x + tableWidth, y)
                    .stroke();
            }
            doc.restore();
        }

        function header() {
            rowBorders(headerH, "header", borderColor, headerFill);
            doc.font(headerFont)
                .fontSize(headerFontSize)
                .fillColor(headerColor);
            x = tableLeft;
            y += cellPaddingY;
            x += cellPaddingX;
            for (j = 0; j < columns.length; j++) {
                col = columns[j];
                w = colWidths[j];
                doc.text(col.label, x, y, {
                    width: w,
                    height: headerH,
                    align: col.headerAlign || options.headerAlign || "left"
                });
                x += 2 * cellPaddingX + w;
            }
            rowTop += headerH;
            y = rowTop;
            x = tableLeft;
            doc.lineWidth(headerBorderWidth[BOTTOM])
                .moveTo(x, y)
                .lineTo(x + tableWidth, y)
                .stroke();
        }

        // check and adjust widths
        colWidths = [];
        available = tableWidth - ( columns.length * 2 * cellPaddingX );
        tw = 0;
        for (j = 0; j < columns.length; j++) {
            col = columns[j];
            tw += col.width;
        }
        console.log("xxx ", tableWidth, available, tw, available - tw);
        available -= tw;
        // distribute available width across all columns
        tableWidth = 0;
        for (j = 0; j < columns.length; j++) {
            col = columns[j];
            colWidths[j] = Math.floor( col.width + ( available * (col.width / tw)) );
            tableWidth += colWidths[j];
        }
        tableWidth += columns.length * 2 * cellPaddingX;
        console.log("xxx ", tableWidth, colWidths);

        doc.font(headerFont)
            .fontSize(headerFontSize);
        headerH = Math.max(options.headerHeight || 0, doc.currentLineHeight() + (cellPaddingY * 2));

        doc.font(cellFont)
            .fontSize(cellFontSize);
        cellH = Math.max(options.cellHeight || 0, doc.currentLineHeight() + (cellPaddingY * 2));
        console.log("xxx row heights: ", headerH, cellH);

        console.log("xxx table border ", tableBorderWidth);
        console.log("xxx header border ", headerBorderWidth);
        console.log("xxx cell border ", cellBorderWidth);

        x = tableLeft;
        y = rowTop;
        // if a break is defined it will end up printing the initial header
        if (!options.breakOn) {
            header();
            doc.font(cellFont)
                .fontSize(cellFontSize);
        }

        lastBreak = null;
        for (i = 0; i < data.length; i++) {
            row = data[i];

            if (options.breakOn) {
                br = options.breakOn(row);
                if (br !== lastBreak) {
                    lastBreak = br;
                    if (i > 0) {
                        rowBottomBorders("last", borderColor);
                    }
                    options.breakAction(doc, row, i);
                    x = tableLeft;
                    y = rowTop = doc.y;
                    header();
                    doc.font(cellFont)
                        .fontSize(cellFontSize);
                }
            }

            if ( y + cellH > doc.page.height -  doc.page.margins.bottom) {
                rowBottomBorders("last", borderColor);
                doc.addPage();
                x = tableLeft;
                y = rowTop = doc.y;
                header();
                doc.font(cellFont)
                    .fontSize(cellFontSize);
            }

            cellColor = "#000";
            cellFill = null;
            if (options.stripe) {
                curStripe = options.stripe[i % options.stripe.length];
                cellColor = curStripe.color || cellColor;
                cellFill = curStripe.fill || cellFill;
            }
            rowBorders(cellH, "cell", borderColor, cellFill);
            doc.fillColor(cellColor); // this is for text color
            x = tableLeft;
            x += cellPaddingX;
            y += cellPaddingY;
            for (j = 0; j < columns.length; j++) {
                col = columns[j];
                w = colWidths[j];
                if (col.prop) {
                    value = row[col.prop];
                    if (value === null || value === undefined && options.nullValue ) {
                        value = options.nullValue;
                    }
                } else {
                    value = "";
                }
                // xxx todo make use of format
                if (value !== null && value !== undefined) {
                    if (col.color) {
                        doc.fillColor(col.color); // override color for just this cell text
                    }
                    doc.text(value, x, y, {
                        width: w,
                        height: cellH,
                        align: col.align || "left"
                    });
                    if (col.color) {
                        doc.fillColor(cellColor); // restore color
                    }
                }
                x += 2 * cellPaddingX + w;
            }
            x = tableLeft;
            rowTop += cellH;
            y = rowTop;
        }
        rowBottomBorders("last", borderColor);
    }
};
