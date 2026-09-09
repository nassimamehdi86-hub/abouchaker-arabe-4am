/* =========================================================================================
   إدارة التلاميذ (Student Management System)
   - حذف التلاميذ بشكل فردي أو جماعي
   - تحديث بيانات التلاميذ
   - إدارة الصلاحيات
   ========================================================================================= */

const StudentManagement = {
  selectedStudents: new Set(),
  allStudents: [],

  /* تحميل قائمة التلاميذ المقبولين */
  async loadStudents() {
    if (!fbReady || !db) {
      console.warn('Firebase غير متاح');
      return [];
    }

    try {
      const snapshot = await db.collection('students')
        .where('status', '==', 'approved')
        .get();
      
      this.allStudents = [];
      snapshot.forEach(doc => {
        this.allStudents.push({
          id: doc.id,
          ...doc.data()
        });
      });
      return this.allStudents;
    } catch (error) {
      console.error('خطأ في تحميل التلاميذ:', error);
      return [];
    }
  },

  /* حذف كل نقاط/نتائج تلميذ واحد من جميع الإحصائيات والترتيبات، قبل حذف حسابه نهائيًا:
     1) نتائج تمارين كل الدروس  → submissions/{lessonId}/students/{studentId}
     2) نتائج الفروض والاختبارات → exams/{examId}/submissions/{studentId}
     3) سجلات حلول تمارين الزوم  → zoomSolutions (حيث studentId == التلميذ)
     بهذا تختفي نقاطه تلقائيًا من: الترتيب الشامل (لوحة الشرف)، ترتيب الفروض والاختبارات،
     وترتيب كل درس على حدة، دون ترك أي أثر لحسابه المحذوف. */
  async deleteStudentPointsEverywhere(studentId) {
    if (!fbReady || !db) return;

    const refsToDelete = [];

    /* 1) نتائج تمارين الدروس — معرف كل مستند فرعي هو نفسه معرف التلميذ */
    (window.LESSONS || []).forEach(lesson => {
      refsToDelete.push(
        db.collection('submissions').doc(lesson.id).collection('students').doc(studentId)
      );
    });

    /* 2) نتائج الفروض والاختبارات */
    try {
      const examsSnap = await db.collection('exams').get();
      examsSnap.forEach(examDoc => {
        refsToDelete.push(
          db.collection('exams').doc(examDoc.id).collection('submissions').doc(studentId)
        );
      });
    } catch (error) {
      console.warn('تعذّر جلب قائمة الفروض والاختبارات أثناء حذف نقاط التلميذ:', error);
    }

    /* 3) سجلات حلول تمارين الزوم */
    try {
      const zoomSnap = await db.collection('zoomSolutions').where('studentId', '==', studentId).get();
      zoomSnap.forEach(doc => refsToDelete.push(doc.ref));
    } catch (error) {
      console.warn('تعذّر جلب سجلات حلول الزوم أثناء حذف نقاط التلميذ:', error);
    }

    /* الحذف على دفعات (حد أقصى 450 عملية لكل دفعة احتياطًا لحد Firestore البالغ 500) */
    const chunkSize = 450;
    for (let i = 0; i < refsToDelete.length; i += chunkSize) {
      const batch = db.batch();
      refsToDelete.slice(i, i + chunkSize).forEach(ref => batch.delete(ref));
      try {
        await batch.commit();
      } catch (error) {
        console.error('خطأ أثناء حذف نقاط التلميذ من الإحصائيات والترتيبات:', error);
      }
    }
  },

  /* حذف تلميذ واحد */
  lastError: null,
  async deleteStudent(studentId) {
    this.lastError = null;
    if (!fbReady || !db) {
      alert('لا يمكن حذف التلاميذ بدون اتصال Firebase');
      return false;
    }

    try {
      /* حذف كل نقاطه من الإحصائيات والترتيبات أولاً، ثم حذف حسابه نهائيًا */
      await this.deleteStudentPointsEverywhere(studentId);
      await db.collection('students').doc(studentId).delete();
      this.allStudents = this.allStudents.filter(s => s.id !== studentId);
      return true;
    } catch (error) {
      console.error('خطأ في حذف التلميذ:', error);
      this.lastError = error;
      return false;
    }
  },

  /* حذف عدة تلاميذ في دفعة واحدة */
  async deleteMultipleStudents(studentIds) {
    this.lastError = null;
    if (!fbReady || !db) {
      alert('لا يمكن حذف التلاميذ بدون اتصال Firebase');
      return false;
    }

    try {
      /* حذف نقاط كل تلميذ من الإحصائيات والترتيبات قبل حذف الحسابات */
      for (const id of studentIds) {
        await this.deleteStudentPointsEverywhere(id);
      }

      const batch = db.batch();
      studentIds.forEach(id => {
        const docRef = db.collection('students').doc(id);
        batch.delete(docRef);
      });

      await batch.commit();
      this.allStudents = this.allStudents.filter(s => !studentIds.includes(s.id));
      this.selectedStudents.clear();
      return true;
    } catch (error) {
      console.error('خطأ في حذف التلاميذ:', error);
      this.lastError = error;
      return false;
    }
  },

  /* تحديد تلميذ */
  toggleStudentSelection(studentId) {
    if (this.selectedStudents.has(studentId)) {
      this.selectedStudents.delete(studentId);
    } else {
      this.selectedStudents.add(studentId);
    }
  },

  /* تحديد الكل */
  selectAll() {
    this.allStudents.forEach(s => this.selectedStudents.add(s.id));
  },

  /* إلغاء تحديد الكل */
  deselectAll() {
    this.selectedStudents.clear();
  },

  /* الحصول على عدد المحددين */
  getSelectedCount() {
    return this.selectedStudents.size;
  },

  /* تحديث بيانات التلميذ */
  async updateStudent(studentId, updates) {
    if (!fbReady || !db) {
      alert('لا يمكن تحديث البيانات بدون اتصال Firebase');
      return false;
    }

    try {
      await db.collection('students').doc(studentId).update(updates);
      const studentIndex = this.allStudents.findIndex(s => s.id === studentId);
      if (studentIndex >= 0) {
        this.allStudents[studentIndex] = {
          ...this.allStudents[studentIndex],
          ...updates
        };
      }
      return true;
    } catch (error) {
      console.error('خطأ في تحديث بيانات التلميذ:', error);
      return false;
    }
  },

  /* الحصول على إحصائيات التلميذ */
  async getStudentStats(studentId) {
    if (!fbReady || !db) return null;

    try {
      const docSnap = await db.collection('students').doc(studentId).get();
      if (docSnap.exists) {
        return docSnap.data();
      }
      return null;
    } catch (error) {
      console.error('خطأ في الحصول على إحصائيات التلميذ:', error);
      return null;
    }
  },

  /* البحث عن التلاميذ بالاسم */
  searchStudents(query) {
    const normalized = normalizeAr(query.toLowerCase());
    return this.allStudents.filter(student => {
      const nameNormalized = normalizeAr(student.fullName.toLowerCase());
      return nameNormalized.includes(normalized);
    });
  },

  /* تصدير قائمة التلاميذ إلى CSV */
  exportToCSV() {
    if (this.allStudents.length === 0) {
      alert('لا توجد بيانات للتصدير');
      return;
    }

    let csv = 'الرقم,الاسم واللقب,حالة الحساب,نسبة التقدم,تاريخ الانضمام\n';
    this.allStudents.forEach((student, index) => {
      const avgScore = student.averageScore || 0;
      const joinDate = student.joinDate ? new Date(student.joinDate).toLocaleDateString('ar-EG') : 'غير محدد';
      csv += `${index + 1},"${student.fullName}",${student.status},${avgScore}%,${joinDate}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  },

  /* إرسال رسالة جماعية للتلاميذ (عبر الإشعارات) */
  async sendMassMessage(message, studentIds = null) {
    if (!fbReady || !db) {
      alert('لا يمكن إرسال الرسائل بدون اتصال Firebase');
      return false;
    }

    try {
      const ids = studentIds || Array.from(this.selectedStudents);
      if (ids.length === 0) {
        alert('اختر على الأقل تلميذاً واحداً');
        return false;
      }

      const batch = db.batch();
      ids.forEach(id => {
        const docRef = db.collection('notifications').doc();
        batch.set(docRef, {
          title: 'رسالة من الأستاذ',
          message,
          icon: '📢',
          timestamp: new Date(),
          isNew: true,
          read: false,
          sentTo: id
        });
      });

      await batch.commit();
      return true;
    } catch (error) {
      console.error('خطأ في إرسال الرسائل الجماعية:', error);
      return false;
    }
  },

  /* الحصول على تقرير نهائي عن التلاميذ */
  async getStudentsReport() {
    if (!fbReady || !db) return null;

    try {
      const students = await this.loadStudents();
      const report = {
        totalStudents: students.length,
        totalApproved: students.filter(s => s.status === 'approved').length,
        averageScore: this.calculateAverageScore(students),
        topPerformers: this.getTopPerformers(students, 5),
        studentsNeedingHelp: this.getStudentsNeedingHelp(students, 5)
      };
      return report;
    } catch (error) {
      console.error('خطأ في إنشاء التقرير:', error);
      return null;
    }
  },

  /* حساب متوسط الدرجات */
  calculateAverageScore(students) {
    if (students.length === 0) return 0;
    const sum = students.reduce((acc, s) => acc + (s.averageScore || 0), 0);
    return Math.round(sum / students.length);
  },

  /* الحصول على أفضل الطلاب */
  getTopPerformers(students, limit = 5) {
    return students
      .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
      .slice(0, limit);
  },

  /* الحصول على الطلاب الذين يحتاجون مساعدة */
  getStudentsNeedingHelp(students, limit = 5) {
    return students
      .filter(s => (s.averageScore || 0) < 50)
      .sort((a, b) => (a.averageScore || 0) - (b.averageScore || 0))
      .slice(0, limit);
  }
};
