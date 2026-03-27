"""灵感收集工具 - Flask应用"""
import os
import uuid
from datetime import datetime
from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///inspirations.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB

db = SQLAlchemy(app)

# 状态选项
STATUSES = ['待整理', '待实现', '已实现', '已归档']
STATUS_COLORS = {
    '待整理': '#6c757d',
    '待实现': '#007bff',
    '已实现': '#28a745',
    '已归档': '#ffc107'
}

# 内容类型
CONTENT_TYPES = ['文字', '链接', '图片', '视频']
TYPE_ICONS = {
    '文字': '📝',
    '链接': '🔗',
    '图片': '🖼️',
    '视频': '🎬'
}


class Inspiration(db.Model):
    """灵感记录模型"""
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)  # 标题
    content = db.Column(db.Text)  # 内容（文字/链接/描述）
    content_type = db.Column(db.String(50), default='文字')  # 内容类型
    file_path = db.Column(db.String(500))  # 文件路径（图片/视频）
    source = db.Column(db.String(200))  # 来源平台
    category = db.Column(db.String(100))  # 分类
    tags = db.Column(db.String(500))  # 标签（逗号分隔）
    status = db.Column(db.String(50), default='待整理')  # 状态
    notes = db.Column(db.Text)  # 备注
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.now, onupdate=datetime.now)
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'content_type': self.content_type,
            'file_path': self.file_path,
            'source': self.source,
            'category': self.category,
            'tags': self.tags,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M'),
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M')
        }


@app.route('/')
def index():
    """首页"""
    category_filter = request.args.get('category', '')
    type_filter = request.args.get('type', '')
    search = request.args.get('search', '')
    
    query = Inspiration.query
    
    if category_filter:
        query = query.filter(Inspiration.category == category_filter)
    if type_filter:
        query = query.filter(Inspiration.content_type == type_filter)
    if search:
        query = query.filter(
            db.or_(
                Inspiration.title.contains(search),
                Inspiration.content.contains(search),
                Inspiration.tags.contains(search)
            )
        )
    
    items = query.order_by(Inspiration.created_at.desc()).all()
    
    # 获取所有分类
    categories = db.session.query(Inspiration.category).distinct().all()
    categories = [c[0] for c in categories if c[0]]
    
    # 统计
    stats = {
        'total': Inspiration.query.count(),
        '待整理': Inspiration.query.filter(Inspiration.status == '待整理').count(),
        '待实现': Inspiration.query.filter(Inspiration.status == '待实现').count(),
        '已实现': Inspiration.query.filter(Inspiration.status == '已实现').count(),
    }
    
    return render_template('index.html', 
                         items=items,
                         categories=categories,
                         content_types=CONTENT_TYPES,
                         type_icons=TYPE_ICONS,
                         statuses=STATUSES,
                         status_colors=STATUS_COLORS,
                         stats=stats,
                         current_category=category_filter,
                         current_type=type_filter,
                         search=search)


@app.route('/add', methods=['GET', 'POST'])
def add_item():
    """添加灵感"""
    if request.method == 'POST':
        file_path = None
        
        # 处理文件上传
        if 'file' in request.files:
            file = request.files['file']
            if file.filename:
                ext = os.path.splitext(file.filename)[1]
                filename = f"{uuid.uuid4().hex}{ext}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                file_path = filename
        
        item = Inspiration(
            title=request.form['title'],
            content=request.form.get('content', ''),
            content_type=request.form.get('content_type', '文字'),
            file_path=file_path,
            source=request.form.get('source', ''),
            category=request.form.get('category', ''),
            tags=request.form.get('tags', ''),
            status=request.form.get('status', '待整理'),
            notes=request.form.get('notes', '')
        )
        db.session.add(item)
        db.session.commit()
        return redirect(url_for('index'))
    
    categories = db.session.query(Inspiration.category).distinct().all()
    categories = [c[0] for c in categories if c[0]]
    
    return render_template('add.html', 
                         content_types=CONTENT_TYPES,
                         statuses=STATUSES,
                         categories=categories)


@app.route('/edit/<int:item_id>', methods=['GET', 'POST'])
def edit_item(item_id):
    """编辑灵感"""
    item = Inspiration.query.get_or_404(item_id)
    
    if request.method == 'POST':
        # 处理文件上传
        if 'file' in request.files:
            file = request.files['file']
            if file.filename:
                ext = os.path.splitext(file.filename)[1]
                filename = f"{uuid.uuid4().hex}{ext}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                item.file_path = filename
        
        item.title = request.form['title']
        item.content = request.form.get('content', '')
        item.content_type = request.form.get('content_type', '文字')
        item.source = request.form.get('source', '')
        item.category = request.form.get('category', '')
        item.tags = request.form.get('tags', '')
        item.status = request.form.get('status', '待整理')
        item.notes = request.form.get('notes', '')
        db.session.commit()
        return redirect(url_for('index'))
    
    categories = db.session.query(Inspiration.category).distinct().all()
    categories = [c[0] for c in categories if c[0]]
    
    return render_template('edit.html', 
                         item=item,
                         content_types=CONTENT_TYPES,
                         statuses=STATUSES,
                         categories=categories)


@app.route('/delete/<int:item_id>', methods=['POST'])
def delete_item(item_id):
    """删除灵感"""
    item = Inspiration.query.get_or_404(item_id)
    # 删除文件
    if item.file_path:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], item.file_path)
        if os.path.exists(file_path):
            os.remove(file_path)
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """提供上传文件访问"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


@app.route('/api/status/<int:item_id>', methods=['PUT'])
def update_status(item_id):
    """更新状态"""
    item = Inspiration.query.get_or_404(item_id)
    data = request.get_json()
    item.status = data.get('status', item.status)
    db.session.commit()
    return jsonify({'success': True, 'status': item.status})


@app.route('/api/items')
def api_items():
    """API获取所有记录"""
    items = Inspiration.query.order_by(Inspiration.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])


if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5001)
