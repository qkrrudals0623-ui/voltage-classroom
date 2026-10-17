// Uses the original student chart configuration and drawing plugins.
window.createStudentChart = function(canvas, selectedGroup) {
      const crispAxesPlugin = {
        id: 'crispAxesPlugin',
        afterDraw: function (chartInstance) {
          const ctx = chartInstance.ctx;
          const chartArea = chartInstance.chartArea;
          const xScale = chartInstance.scales.x;
          const yScale = chartInstance.scales.y;
          if (!chartArea || !xScale || !yScale) return;

          const left = chartArea.left;
          const right = chartArea.right;
          const top = chartArea.top;
          const bottom = chartArea.bottom;

          const yZero = Math.max(top, Math.min(bottom, yScale.getPixelForValue(0)));
          const xAxisPos = left;

          ctx.save();
          ctx.strokeStyle = '#000000';
          ctx.fillStyle = '#000000';
          ctx.lineWidth = 2;

          // 1. Horizontal axis line (y = 0)
          ctx.beginPath();
          ctx.moveTo(left, yZero);
          ctx.lineTo(right, yZero);
          ctx.stroke();

          // Right arrowhead on X-axis
          ctx.beginPath();
          ctx.moveTo(right - 7, yZero - 5);
          ctx.lineTo(right, yZero);
          ctx.lineTo(right - 7, yZero + 5);
          ctx.stroke();

          // 2. Vertical axis line (x = left)
          ctx.beginPath();
          ctx.moveTo(xAxisPos, top);
          ctx.lineTo(xAxisPos, bottom);
          ctx.stroke();

          // Top arrowhead on Y-axis
          ctx.beginPath();
          ctx.moveTo(xAxisPos - 5, top + 7);
          ctx.lineTo(xAxisPos, top);
          ctx.lineTo(xAxisPos + 5, top + 7);
          ctx.stroke();

          // 3. Crisp black tick marks along both axes
          ctx.lineWidth = 1.5;
          const xTicks = xScale.ticks || [];
          for (let i = 0; i < xTicks.length; i++) {
            const px = xScale.getPixelForTick(i);
            if (px > left + 4 && px < right - 8) {
              ctx.beginPath();
              ctx.moveTo(px, yZero - 4);
              ctx.lineTo(px, yZero + 4);
              ctx.stroke();
            }
          }

          const yTicks = yScale.ticks || [];
          for (let j = 0; j < yTicks.length; j++) {
            const py = yScale.getPixelForTick(j);
            if (py > top + 8 && py < bottom - 8) {
              ctx.beginPath();
              ctx.moveTo(xAxisPos - 4, py);
              ctx.lineTo(xAxisPos + 4, py);
              ctx.stroke();
            }
          }

          if (selectedGroup !== null) {
            ctx.font = "18px Jua, sans-serif";
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const label = selectedGroup + '조';
            const labelWidth = ctx.measureText(label).width;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(left + 9, top + 9, labelWidth + 16, 28);
            ctx.fillStyle = '#365447';
            ctx.fillText(label, left + 17, top + 14);
          }
          ctx.restore();
        }
      };

      let lineReveal = null;
      const progressiveLinePlugin = {
        id: 'progressiveLine',
        beforeDatasetsDraw(chartInstance) {
          const points = chartInstance.getDatasetMeta(0).data;
          const values = chartInstance.data.datasets[0].data;
          const ctx = chartInstance.ctx;
          const area = chartInstance.chartArea;
          ctx.save();
          ctx.beginPath();
          ctx.rect(area.left, area.top, area.right-area.left, area.bottom-area.top);
          ctx.clip();
          ctx.strokeStyle = '#557e58';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (let i = 1; i < points.length; i++) {
            let from = points[i-1], to = points[i];
            let progress = 1;
            if (lineReveal && (values[i-1].x === lineReveal.voltage || values[i].x === lineReveal.voltage)) {
              progress = lineReveal.progress;
              // Grow from the existing neighbour toward the recorded point.
              if (values[i-1].x === lineReveal.voltage) [from, to] = [to, from];
            }
            if (progress <= 0) continue;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(from.x + (to.x-from.x)*progress, from.y + (to.y-from.y)*progress);
            ctx.stroke();
          }
          ctx.restore();
        }
      };

      return new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
          datasets: [{
            label: '전류 (A)',
            data: [],
            borderColor: '#557e58',
            backgroundColor: 'transparent',
            borderWidth: 3,
            showLine: false,
            pointRadius: c => lineReveal && c.raw?.x === lineReveal.voltage ? 0 : 5,
            pointHoverRadius: c => lineReveal && c.raw?.x === lineReveal.voltage ? 0 : 7,
            pointHitRadius: c => lineReveal && c.raw?.x === lineReveal.voltage ? 0 : 1,
            pointBackgroundColor: '#557e58',
            fill: false,
            tension: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          layout: {
            padding: { top: 8, right: 10, bottom: 4, left: 4 }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              displayColors: false,
              callbacks: {
                title: function (items) {
                  return items.length ? Number(items[0].parsed.x).toFixed(3) + ' V' : '';
                },
                label: function (c) {
                  return Number(c.parsed.y).toFixed(3) + ' A';
                }
              }
            }
          },
          scales: {
            x: {
              type: 'linear',
              min: 0,
              max: 7.5,
              title: {display:true, text:'전압 (V)'},
              border: { display: true, color: '#cbd5e1', width: 1 },
              grid: {
                color: '#dcdcdc',
                lineWidth: 1
              },
              ticks: {
                stepSize: 1.5,
                color: '#475569',
                font: { family: 'Gowun Dodum', size: 10 },
                callback: function (v) { return Number(v).toFixed(1) + 'V'; }
              }
            },
            y: {
              min: 0,
              suggestedMax: 0.1,
              title: {display:true, text:'전류 (A)'},
              border: { display: true, color: '#cbd5e1', width: 1 },
              grid: {
                color: '#dcdcdc',
                lineWidth: 1
              },
              ticks: {
                maxTicksLimit: 7,
                color: '#475569',
                font: { family: 'Gowun Dodum', size: 10 },
                callback: function (v) { return Number(v).toLocaleString('ko-KR', {maximumFractionDigits:3}) + 'A'; }
              }
            }
          }
        },
        plugins: [progressiveLinePlugin, crispAxesPlugin]
      });


};
